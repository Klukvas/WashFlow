import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CircuitBreaker } from '../../common/utils/circuit-breaker';

export interface PaddlePriceInfo {
  amountCents: string;
  currency: string;
  name: string;
}

export interface PaddleCheckoutConfig {
  transactionId?: string;
  customerId?: string;
  items: Array<{ priceId: string; quantity: number }>;
  customData?: Record<string, string>;
}

export interface PaddleLineItem {
  name: string;
  quantity: number;
  unitPriceCents: string;
  totalCents: string;
}

export interface PaddleTransaction {
  id: string;
  status: string;
  totalCents: string;
  taxCents: string;
  currency: string;
  createdAt: string;
  billingPeriod: { startsAt: string; endsAt: string } | null;
  lineItems: Array<{
    name: string;
    quantity: number;
    totalCents: string;
  }>;
}

export interface PaddleBillingDetails {
  currencyCode: string;
  billingInterval: string;
  billingFrequency: number;
  subtotalCents: string;
  taxCents: string;
  totalCents: string;
  discountCents: string;
  lineItems: PaddleLineItem[];
  nextBillingDate: string | null;
}

export interface PaddleSubscriptionPreview {
  immediateTransaction?: {
    amount: string;
    currency: string;
  };
  nextTransaction?: {
    amount: string;
    currency: string;
    billingDate: string;
  };
}

export class PaddleApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'PaddleApiError';
  }
}

@Injectable()
export class PaddleService {
  private readonly logger = new Logger(PaddleService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('paddle.apiKey', '');
    const isSandbox = this.config.get<boolean>('paddle.sandbox', true);
    this.baseUrl = isSandbox
      ? 'https://sandbox-api.paddle.com'
      : 'https://api.paddle.com';
    this.circuitBreaker = new CircuitBreaker({
      name: 'Paddle',
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
    });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    return this.circuitBreaker.fire(async () => {
      const url = `${this.baseUrl}${path}`;
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Paddle API error: ${response.status} ${method} ${path}: ${errorBody}`,
        );
        let errorCode = 'unknown';
        try {
          const parsed = JSON.parse(errorBody) as {
            error?: { code?: string };
          };
          errorCode = parsed.error?.code ?? 'unknown';
        } catch {
          // ignore parse failure
        }
        throw new PaddleApiError(
          response.status,
          errorCode,
          `Paddle API error: ${response.status}`,
        );
      }

      const json = (await response.json()) as { data: T };
      return json.data;
    });
  }

  /** Like request(), but typed for Paddle list endpoints that return an array. */
  private async requestList<T>(path: string, perPage = 200): Promise<T[]> {
    const separator = path.includes('?') ? '&' : '?';
    return this.request<T[]>('GET', `${path}${separator}per_page=${perPage}`);
  }

  /**
   * Fetches prices from Paddle API for the given price IDs.
   * Returns a Map of priceId → { amountCents, currency, name }.
   */
  async fetchAllPrices(
    priceIds: string[],
  ): Promise<Map<string, PaddlePriceInfo>> {
    if (priceIds.length === 0) return new Map();

    const query = priceIds.map((id) => `id=${id}`).join('&');
    const items = await this.requestList<{
      id: string;
      unit_price: { amount: string; currency_code: string };
      name: string;
    }>(`/prices?${query}&status=active`);

    const result = new Map<string, PaddlePriceInfo>();
    for (const item of items) {
      result.set(item.id, {
        amountCents: item.unit_price.amount,
        currency: item.unit_price.currency_code,
        name: item.name,
      });
    }
    return result;
  }

  async createCheckoutTransaction(params: {
    items: Array<{ priceId: string; quantity: number }>;
    customerId?: string;
    customerEmail?: string;
    customData?: Record<string, string>;
  }): Promise<{ transactionId: string }> {
    const body: Record<string, unknown> = {
      items: params.items.map((item) => ({
        price_id: item.priceId,
        quantity: item.quantity,
      })),
    };

    if (params.customerId) {
      body.customer_id = params.customerId;
    } else if (params.customerEmail) {
      // No existing Paddle customer — pass email so Paddle pre-fills & locks it
      body.customer = { email: params.customerEmail };
    }

    if (params.customData) {
      body.custom_data = params.customData;
    }

    const result = await this.request<{ id: string }>(
      'POST',
      '/transactions',
      body,
    );

    return { transactionId: result.id };
  }

  async updateSubscription(
    paddleSubscriptionId: string,
    params: {
      items?: Array<{ priceId: string; quantity: number }>;
      prorationBillingMode?: string;
    },
  ): Promise<void> {
    const body: Record<string, unknown> = {};

    if (params.items) {
      body.items = params.items.map((item) => ({
        price_id: item.priceId,
        quantity: item.quantity,
      }));
    }

    if (params.prorationBillingMode) {
      body.proration_billing_mode = params.prorationBillingMode;
    }

    await this.request<unknown>(
      'PATCH',
      `/subscriptions/${paddleSubscriptionId}`,
      body,
    );
  }

  async previewSubscriptionUpdate(
    paddleSubscriptionId: string,
    params: {
      items: Array<{ priceId: string; quantity: number }>;
      prorationBillingMode?: string;
    },
  ): Promise<PaddleSubscriptionPreview> {
    const body: Record<string, unknown> = {
      items: params.items.map((item) => ({
        price_id: item.priceId,
        quantity: item.quantity,
      })),
    };

    if (params.prorationBillingMode) {
      body.proration_billing_mode = params.prorationBillingMode;
    }

    const result = await this.request<{
      immediate_transaction?: { details?: { totals?: { total?: string } } };
      next_transaction?: {
        details?: { totals?: { total?: string } };
        billing_period?: { starts_at?: string };
      };
      currency_code?: string;
    }>('POST', `/subscriptions/${paddleSubscriptionId}/preview`, body);

    return {
      immediateTransaction: result.immediate_transaction?.details?.totals?.total
        ? {
            amount: result.immediate_transaction.details.totals.total,
            currency: result.currency_code ?? 'USD',
          }
        : undefined,
      nextTransaction: result.next_transaction?.details?.totals?.total
        ? {
            amount: result.next_transaction.details.totals.total,
            currency: result.currency_code ?? 'USD',
            billingDate:
              result.next_transaction.billing_period?.starts_at ?? '',
          }
        : undefined,
    };
  }

  async reactivateSubscription(paddleSubscriptionId: string): Promise<void> {
    await this.request<unknown>(
      'PATCH',
      `/subscriptions/${paddleSubscriptionId}`,
      { scheduled_change: null },
    );
  }

  async cancelSubscription(
    paddleSubscriptionId: string,
    effectiveFrom:
      | 'immediately'
      | 'next_billing_period' = 'next_billing_period',
  ): Promise<void> {
    await this.request<unknown>(
      'POST',
      `/subscriptions/${paddleSubscriptionId}/cancel`,
      { effective_from: effectiveFrom },
    );
  }

  async getSubscriptionBilling(
    paddleSubscriptionId: string,
  ): Promise<PaddleBillingDetails> {
    const result = await this.request<{
      currency_code: string;
      billing_cycle?: { interval: string; frequency: number };
      recurring_transaction_details?: {
        totals?: {
          subtotal?: string;
          tax?: string;
          total?: string;
          discount?: string;
        };
        line_items?: Array<{
          quantity: number;
          totals?: { subtotal?: string; total?: string };
          price?: { unit_price?: { amount?: string } };
          product?: { name?: string };
        }>;
      };
      next_transaction?: {
        billing_period?: { starts_at?: string };
      };
    }>(
      'GET',
      `/subscriptions/${paddleSubscriptionId}?include=recurring_transaction_details,next_transaction`,
    );

    const totals = result.recurring_transaction_details?.totals;
    const rawLineItems = result.recurring_transaction_details?.line_items ?? [];

    return {
      currencyCode: result.currency_code ?? 'USD',
      billingInterval: result.billing_cycle?.interval ?? 'month',
      billingFrequency: result.billing_cycle?.frequency ?? 1,
      subtotalCents: totals?.subtotal ?? '0',
      taxCents: totals?.tax ?? '0',
      totalCents: totals?.total ?? '0',
      discountCents: totals?.discount ?? '0',
      lineItems: rawLineItems.map((item) => ({
        name: item.product?.name ?? 'Unknown',
        quantity: item.quantity,
        unitPriceCents: item.price?.unit_price?.amount ?? '0',
        totalCents: item.totals?.total ?? '0',
      })),
      nextBillingDate:
        result.next_transaction?.billing_period?.starts_at ?? null,
    };
  }

  async getSubscription(paddleSubscriptionId: string): Promise<{
    id: string;
    status: string;
    customerId: string;
    currentBillingPeriod?: {
      startsAt: string;
      endsAt: string;
    };
    items: Array<{
      priceId: string;
      quantity: number;
    }>;
  }> {
    const result = await this.request<{
      id: string;
      status: string;
      customer_id: string;
      current_billing_period?: {
        starts_at: string;
        ends_at: string;
      };
      items: Array<{
        price: { id: string };
        quantity: number;
      }>;
    }>('GET', `/subscriptions/${paddleSubscriptionId}`);

    return {
      id: result.id,
      status: result.status,
      customerId: result.customer_id,
      currentBillingPeriod: result.current_billing_period
        ? {
            startsAt: result.current_billing_period.starts_at,
            endsAt: result.current_billing_period.ends_at,
          }
        : undefined,
      items: result.items.map((item) => ({
        priceId: item.price.id,
        quantity: item.quantity,
      })),
    };
  }

  async getTransactionHistory(
    paddleSubscriptionId: string,
  ): Promise<PaddleTransaction[]> {
    const items = await this.requestList<{
      id: string;
      status: string;
      details?: {
        totals?: { total?: string; tax?: string };
        line_items?: Array<{
          quantity: number;
          totals?: { total?: string };
          product?: { name?: string };
        }>;
      };
      currency_code?: string;
      created_at: string;
      billing_period?: { starts_at: string; ends_at: string };
    }>(`/transactions?subscription_id=${paddleSubscriptionId}`);

    return items.map((txn) => ({
      id: txn.id,
      status: txn.status,
      totalCents: txn.details?.totals?.total ?? '0',
      taxCents: txn.details?.totals?.tax ?? '0',
      currency: txn.currency_code ?? 'USD',
      createdAt: txn.created_at,
      billingPeriod: txn.billing_period
        ? {
            startsAt: txn.billing_period.starts_at,
            endsAt: txn.billing_period.ends_at,
          }
        : null,
      lineItems: (txn.details?.line_items ?? []).map((li) => ({
        name: li.product?.name ?? 'Unknown',
        quantity: li.quantity,
        totalCents: li.totals?.total ?? '0',
      })),
    }));
  }
}
