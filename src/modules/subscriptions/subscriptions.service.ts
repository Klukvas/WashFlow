import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { SubscriptionsRepository } from './subscriptions.repository';
import { UpsertSubscriptionDto } from './dto/upsert-subscription.dto';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly subscriptionsRepo: SubscriptionsRepository) {}

  async findByTenantId(tenantId: string) {
    const subscription = await this.subscriptionsRepo.findByTenantId(tenantId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    return subscription;
  }

  async upsert(tenantId: string, dto: UpsertSubscriptionDto) {
    const [usersCount, branchesCount, workPostsCount, servicesCount] =
      await Promise.all([
        this.subscriptionsRepo.countUsers(tenantId),
        this.subscriptionsRepo.countBranches(tenantId),
        this.subscriptionsRepo.countWorkPosts(tenantId),
        this.subscriptionsRepo.countServices(tenantId),
      ]);

    const violations: string[] = [];
    if (dto.maxUsers < usersCount) {
      violations.push(`users: ${usersCount} active, limit ${dto.maxUsers}`);
    }
    if (dto.maxBranches < branchesCount) {
      violations.push(
        `branches: ${branchesCount} active, limit ${dto.maxBranches}`,
      );
    }
    if (dto.maxWorkPosts < workPostsCount) {
      violations.push(
        `work posts: ${workPostsCount} active, limit ${dto.maxWorkPosts}`,
      );
    }
    if (dto.maxServices < servicesCount) {
      violations.push(
        `services: ${servicesCount} active, limit ${dto.maxServices}`,
      );
    }

    if (violations.length > 0) {
      throw new ConflictException(
        `Cannot set limits below current usage: ${violations.join('; ')}`,
      );
    }

    return this.subscriptionsRepo.upsert(tenantId, { ...dto });
  }

  async delete(tenantId: string) {
    const subscription = await this.subscriptionsRepo.findByTenantId(tenantId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    return this.subscriptionsRepo.delete(tenantId);
  }
}
