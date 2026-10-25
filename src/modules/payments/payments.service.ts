import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { PaymentsRepository } from './payments.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PaymentReceivedEvent } from '../../common/events/payment-events';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepo: PaymentsRepository,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async findByOrderId(
    tenantId: string,
    orderId: string,
    branchId: string | null = null,
  ) {
    const db = this.tenantPrisma.forTenant(tenantId);
    const order = await db.order.findFirst({
      where: { id: orderId, ...(branchId !== null ? { branchId } : {}) },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return this.paymentsRepo.findByOrderId(tenantId, orderId);
  }

  async create(
    tenantId: string,
    orderId: string,
    dto: CreatePaymentDto,
    performedById: string,
    idempotencyKey?: string,
    branchId: string | null = null,
  ) {
    const identity = this.idempotencyService.requestIdentity(
      {
        tenantId,
        key: idempotencyKey,
        method: 'POST',
        path: `/orders/${orderId}/payments`,
        kind: 'payment-v1',
        actorId: performedById,
      },
      {
        amount: new Prisma.Decimal(dto.amount).toFixed(2),
        method: dto.method,
        status: dto.status ?? PaymentStatus.PAID,
        reference: dto.reference ?? null,
      },
    );
    const { payment, replay } = await this.paymentsRepo.withLockedOrder(
      tenantId,
      orderId,
      async (tx, order) => {
        if (!order || (branchId !== null && order.branchId !== branchId)) {
          throw new NotFoundException('Order not found');
        }

        if (identity) {
          const claim = await this.idempotencyService.claimRequestTx(
            tx,
            identity,
          );
          if (claim.replay) {
            const cached = await this.paymentsRepo.findByIdTx(
              tx,
              tenantId,
              orderId,
              claim.resourceId,
            );
            if (!cached)
              throw new ConflictException(
                'Original payment is no longer available',
              );
            return { payment: cached, replay: true };
          }
        }

        if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(order.status)) {
          throw new BadRequestException(
            `Cannot add payment to an order with status ${order.status}`,
          );
        }

        const existingPayments = await this.paymentsRepo.findByOrderIdTx(
          tx,
          tenantId,
          orderId,
        );
        const totalPaid = existingPayments.reduce(
          (sum, payment) => sum.plus(payment.amount),
          new Prisma.Decimal(0),
        );
        const orderTotal = new Prisma.Decimal(order.totalPrice ?? 0);
        if (
          orderTotal.greaterThan(0) &&
          totalPaid.plus(dto.amount).greaterThan(orderTotal)
        ) {
          throw new BadRequestException(
            `Payment would exceed order total. Remaining: ${orderTotal.minus(totalPaid).toFixed(2)}`,
          );
        }

        const payment = await this.paymentsRepo.createTx(tx, tenantId, {
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference,
          status: dto.status ?? PaymentStatus.PAID,
          orderId,
        });
        if (identity)
          await this.idempotencyService.saveRequestTx(tx, identity, payment.id);
        return { payment, replay: false };
      },
    );

    if (!replay)
      this.eventDispatcher.dispatch(
        new PaymentReceivedEvent(tenantId, {
          paymentId: payment.id,
          orderId,
          amount: dto.amount,
          method: dto.method,
          performedById,
        }),
      );

    return payment;
  }
}
