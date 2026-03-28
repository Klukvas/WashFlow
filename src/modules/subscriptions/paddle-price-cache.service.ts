import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { PRICE_CACHE_REDIS } from './subscriptions.constants';
import { PaddleService, PaddlePriceInfo } from './paddle.service';
import {
  PLAN_CATALOG,
  ADDON_DEFINITIONS,
  DEFAULT_PADDLE_PRICE_IDS,
  DEFAULT_ADDON_PADDLE_PRICE_IDS,
  type PlanDefinition,
  type AddonDefinition,
} from './plan.constants';
import { CircuitOpenError } from '../../common/utils/circuit-breaker';

export interface CachedPlanCatalog {
  plans: Array<{
    tier: string;
    name: string;
    monthlyPrice: number;
    yearlyPrice: number;
    limits: {
      branches: number | null;
      workPosts: number | null;
      users: number | null;
      services: number | null;
    };
    addonsAvailable: boolean;
  }>;
  addons: Array<{
    resource: string;
    unitSize: number;
    monthlyPrice: number;
    name: string;
  }>;
}

@Injectable()
export class PaddlePriceCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaddlePriceCacheService.name);
  private readonly CACHE_KEY = 'catalog';
  private readonly CACHE_TTL = 3600; // 1 hour

  private readonly planPriceIds: Record<string, string>;
  private readonly addonPriceIds: Record<string, string>;
  private refreshPromise: Promise<void> | null = null;

  constructor(
    @Inject(PRICE_CACHE_REDIS) private readonly redis: Redis,
    private readonly paddleService: PaddleService,
    private readonly config: ConfigService,
  ) {
    const configPriceIds =
      this.config.get<Record<string, string>>('paddle.priceIds') ?? {};
    this.planPriceIds = { ...DEFAULT_PADDLE_PRICE_IDS, ...configPriceIds };

    const configAddonPriceIds =
      this.config.get<Record<string, string>>('paddle.addonPriceIds') ?? {};
    this.addonPriceIds = {
      ...DEFAULT_ADDON_PADDLE_PRICE_IDS,
      ...configAddonPriceIds,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.refreshCache();
    } catch (error) {
      this.logger.warn(
        `Failed to populate price cache on startup, will use hardcoded fallback: ${String(error)}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async refreshCache(): Promise<void> {
    const allPriceIds = this.collectAllPriceIds();
    if (allPriceIds.length === 0) {
      this.logger.warn(
        'No Paddle price IDs configured, skipping cache refresh',
      );
      return;
    }

    let paddlePrices: Map<string, PaddlePriceInfo>;
    try {
      paddlePrices = await this.paddleService.fetchAllPrices(allPriceIds);
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        this.logger.warn(
          'Paddle circuit breaker is OPEN — skipping price cache refresh, using stale/fallback values',
        );
        return;
      }
      throw error;
    }

    const catalog = this.buildCatalog(paddlePrices);

    await this.redis.set(
      this.CACHE_KEY,
      JSON.stringify(catalog),
      'EX',
      this.CACHE_TTL,
    );

    this.logger.log(
      `Paddle price cache refreshed (${paddlePrices.size}/${allPriceIds.length} prices fetched)`,
    );
  }

  async getCachedCatalog(): Promise<CachedPlanCatalog> {
    try {
      const cached = await this.redis.get(this.CACHE_KEY);
      if (cached) {
        return JSON.parse(cached) as CachedPlanCatalog;
      }

      // Cache miss — refresh on demand (deduplicated)
      await this.refreshOnce();
      const refreshed = await this.redis.get(this.CACHE_KEY);
      if (refreshed) {
        return JSON.parse(refreshed) as CachedPlanCatalog;
      }
    } catch (error) {
      this.logger.warn(
        `Price cache unavailable, returning hardcoded fallback: ${String(error)}`,
      );
    }

    return this.buildFallbackCatalog();
  }

  /** Deduplicates concurrent refreshCache calls into a single Paddle API request. */
  private refreshOnce(): Promise<void> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshCache().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private collectAllPriceIds(): string[] {
    const ids = new Set<string>();

    for (const plan of PLAN_CATALOG) {
      const tierKey = plan.tier.toLowerCase();
      const monthlyId = this.planPriceIds[`${tierKey}_monthly`];
      const yearlyId = this.planPriceIds[`${tierKey}_yearly`];
      if (monthlyId) ids.add(monthlyId);
      if (yearlyId) ids.add(yearlyId);
    }

    for (const addon of ADDON_DEFINITIONS) {
      const addonId = this.addonPriceIds[addon.resource];
      if (addonId) ids.add(addonId);
    }

    return Array.from(ids);
  }

  private buildCatalog(
    paddlePrices: Map<string, PaddlePriceInfo>,
  ): CachedPlanCatalog {
    const plans = PLAN_CATALOG.map((plan) => {
      const tierKey = plan.tier.toLowerCase();
      const monthlyPriceId = this.planPriceIds[`${tierKey}_monthly`];
      const yearlyPriceId = this.planPriceIds[`${tierKey}_yearly`];

      const monthlyInfo = monthlyPriceId
        ? paddlePrices.get(monthlyPriceId)
        : undefined;
      const yearlyInfo = yearlyPriceId
        ? paddlePrices.get(yearlyPriceId)
        : undefined;

      return {
        tier: plan.tier,
        name: plan.name,
        monthlyPrice: monthlyInfo
          ? centsToDollars(monthlyInfo.amountCents)
          : plan.monthlyPrice,
        yearlyPrice: yearlyInfo
          ? centsToDollars(yearlyInfo.amountCents)
          : plan.yearlyPrice,
        limits: { ...plan.limits },
        addonsAvailable: plan.addonsAvailable,
      };
    });

    const addons = ADDON_DEFINITIONS.map((addon) => {
      const addonPriceId = this.addonPriceIds[addon.resource];
      const addonInfo = addonPriceId
        ? paddlePrices.get(addonPriceId)
        : undefined;

      return {
        resource: addon.resource,
        unitSize: addon.unitSize,
        monthlyPrice: addonInfo
          ? centsToDollars(addonInfo.amountCents)
          : addon.monthlyPrice,
        name: addon.name,
      };
    });

    return { plans, addons };
  }

  private buildFallbackCatalog(): CachedPlanCatalog {
    return {
      plans: PLAN_CATALOG.map((plan: PlanDefinition) => ({
        tier: plan.tier,
        name: plan.name,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        limits: { ...plan.limits },
        addonsAvailable: plan.addonsAvailable,
      })),
      addons: ADDON_DEFINITIONS.map((addon: AddonDefinition) => ({
        resource: addon.resource,
        unitSize: addon.unitSize,
        monthlyPrice: addon.monthlyPrice,
        name: addon.name,
      })),
    };
  }
}

function centsToDollars(cents: string): number {
  const value = Number(cents);
  if (!Number.isFinite(value)) {
    throw new BadGatewayException(
      `Invalid price amount received from Paddle: ${cents}`,
    );
  }
  return value / 100;
}
