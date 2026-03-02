import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

@Injectable()
export class PaymentsRepository {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private db(tenantId: string) {
    return this.tenantPrisma.forTenant(tenantId);
  }

  async findByOrderId(tenantId: string, orderId: string) {
    return this.db(tenantId).payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, data: Record<string, unknown>) {
    return this.db(tenantId).payment.create({
      data: data as Prisma.PaymentUncheckedCreateInput,
    });
  }
}
