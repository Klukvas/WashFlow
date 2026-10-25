import { Injectable } from '@nestjs/common';
import { Order, Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

type LockedOrder = Pick<Order, 'id' | 'status' | 'totalPrice' | 'branchId'>;
type PaymentTransaction = Prisma.TransactionClient;

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

  async withLockedOrder<T>(
    tenantId: string,
    orderId: string,
    callback: (tx: PaymentTransaction, order: LockedOrder | null) => Promise<T>,
  ): Promise<T> {
    return this.db(tenantId).$transaction(
      async (tx) => {
        // Lock the stable parent row, even when there are no payment rows yet.
        // Raw SQL bypasses tenant/soft-delete extensions, so both filters are explicit.
        const orders = await tx.$queryRaw<LockedOrder[]>`
          SELECT id, status, "totalPrice", "branchId" FROM orders
          WHERE id = ${orderId} AND "tenantId" = ${tenantId}
            AND "deletedAt" IS NULL
          FOR UPDATE
        `;
        return callback(tx as unknown as PaymentTransaction, orders[0] ?? null);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async findByOrderIdTx(
    tx: PaymentTransaction,
    tenantId: string,
    orderId: string,
  ) {
    return tx.payment.findMany({ where: { tenantId, orderId } });
  }

  async findByIdTx(
    tx: PaymentTransaction,
    tenantId: string,
    orderId: string,
    id: string,
  ) {
    return tx.payment.findFirst({ where: { id, tenantId, orderId } });
  }

  async createTx(
    tx: PaymentTransaction,
    tenantId: string,
    data: Omit<Prisma.PaymentUncheckedCreateInput, 'tenantId'>,
  ) {
    return tx.payment.create({ data: { ...data, tenantId } });
  }

  async create(tenantId: string, data: Record<string, unknown>) {
    return this.db(tenantId).payment.create({
      data: data as Prisma.PaymentUncheckedCreateInput,
    });
  }
}
