import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { TenantsRepository } from './tenants.repository';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { TRIAL_DEFAULTS } from '../subscriptions/trial.constants';
import { PlanTier, SubscriptionStatus } from '../subscriptions/plan.constants';

@Injectable()
export class TenantsService {
  constructor(
    private readonly tenantsRepo: TenantsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async findAll() {
    return this.tenantsRepo.findAll();
  }

  async findById(id: string) {
    const tenant = await this.tenantsRepo.findById(id);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async findBySlug(slug: string) {
    const tenant = await this.tenantsRepo.findBySlug(slug);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async create(dto: CreateTenantDto) {
    return this.prisma.$transaction(async (tx) => {
      // Check slug uniqueness inside the transaction to avoid TOCTOU races.
      // The DB unique constraint on `slug` is the final safeguard; this check
      // gives a cleaner ConflictException before hitting the constraint.
      const existing = await tx.tenant.findUnique({
        where: { slug: dto.slug },
      });
      if (existing) throw new ConflictException('Slug already in use');

      const tenant = await tx.tenant.create({
        data: { name: dto.name, slug: dto.slug },
      });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planTier: PlanTier.TRIAL,
          status: SubscriptionStatus.TRIALING,
          maxUsers: TRIAL_DEFAULTS.maxUsers,
          maxBranches: TRIAL_DEFAULTS.maxBranches,
          maxWorkPosts: TRIAL_DEFAULTS.maxWorkPosts,
          maxServices: TRIAL_DEFAULTS.maxServices,
          isTrial: true,
          trialEndsAt: new Date(
            Date.now() + TRIAL_DEFAULTS.durationDays * 24 * 60 * 60 * 1000,
          ),
        },
      });

      return tenant;
    });
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.findById(id);
    return this.tenantsRepo.update(id, { ...dto });
  }

  async getBookingSettings(tenantId: string) {
    return this.tenantsRepo.getBookingSettings(tenantId);
  }
}
