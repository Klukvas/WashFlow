import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);
  private readonly retentionDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.retentionDays = this.config.get<number>('cleanup.retentionDays', 30);
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleHardDeleteCleanup() {
    const cutoff = new Date(
      Date.now() - this.retentionDays * 24 * 60 * 60 * 1000,
    );
    this.logger.log(
      `Hard-deleting records soft-deleted before ${cutoff.toISOString()}`,
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        // Delete in FK-respecting order (children first)

        // 1. OrderServices for deleted orders
        await tx.$queryRaw`
          DELETE FROM order_services WHERE "orderId" IN (
            SELECT id FROM orders WHERE "deletedAt" IS NOT NULL AND "deletedAt" < ${cutoff}
          )
        `;

        // 2. Payments for deleted orders
        await tx.$queryRaw`
          DELETE FROM payments WHERE "orderId" IN (
            SELECT id FROM orders WHERE "deletedAt" IS NOT NULL AND "deletedAt" < ${cutoff}
          )
        `;

        // 3. Orders
        const orders = await tx.order.deleteMany({
          where: { deletedAt: { not: null, lt: cutoff } },
        });

        // 4. Vehicles
        const vehicles = await tx.vehicle.deleteMany({
          where: { deletedAt: { not: null, lt: cutoff } },
        });

        // 5. EmployeeProfiles for deleted users (must be before users)
        await tx.$queryRaw`
          DELETE FROM employee_profiles WHERE "userId" IN (
            SELECT id FROM users WHERE "deletedAt" IS NOT NULL AND "deletedAt" < ${cutoff}
          )
        `;

        // 6. Users (must be after orders which reference createdById)
        const users = await tx.user.deleteMany({
          where: { deletedAt: { not: null, lt: cutoff } },
        });

        // 7. Clients (must be after vehicles and orders)
        const clients = await tx.client.deleteMany({
          where: { deletedAt: { not: null, lt: cutoff } },
        });

        // 8. RolePermissions for deleted roles
        await tx.$queryRaw`
          DELETE FROM role_permissions WHERE "roleId" IN (
            SELECT id FROM roles WHERE "deletedAt" IS NOT NULL AND "deletedAt" < ${cutoff}
          )
        `;

        // 9. Roles
        const roles = await tx.role.deleteMany({
          where: { deletedAt: { not: null, lt: cutoff } },
        });

        // 10. Services
        const services = await tx.service.deleteMany({
          where: { deletedAt: { not: null, lt: cutoff } },
        });

        // 11. WorkPosts for deleted branches (must be before branches)
        const workPosts = await tx.workPost.deleteMany({
          where: { deletedAt: { not: null, lt: cutoff } },
        });

        // 12. Branches (must be after orders, users, work_posts)
        const branches = await tx.branch.deleteMany({
          where: { deletedAt: { not: null, lt: cutoff } },
        });

        // 13. Audit logs older than the retention cutoff
        const auditLogs = await tx.auditLog.deleteMany({
          where: { createdAt: { lt: cutoff } },
        });

        this.logger.log(
          `Hard-delete cleanup completed: ${orders.count} orders, ${vehicles.count} vehicles, ` +
            `${users.count} users, ${clients.count} clients, ${roles.count} roles, ` +
            `${services.count} services, ${workPosts.count} work posts, ${branches.count} branches, ` +
            `${auditLogs.count} audit logs`,
        );
      });
    } catch (error) {
      this.logger.error('Hard-delete cleanup failed', (error as Error).stack);
    }
  }
}
