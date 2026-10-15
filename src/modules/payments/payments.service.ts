import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
  ) {}

  async findByOrderId(tenantId: string, orderId: string) {
    const db = this.tenantPrisma.forTenant(tenantId);
    const order = await db.order.findFirst({ where: { id: orderId } });
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
  ) {
    const payment = await this.paymentsRepo.withLockedOrder(
      tenantId,
      orderId,
      async (tx, order) => {
        if (!order) {
          throw new NotFoundException('Order not found');
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

        return this.paymentsRepo.createTx(tx, tenantId, {
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference,
          status: dto.status ?? PaymentStatus.PAID,
          orderId,
        });
      },
    );

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
