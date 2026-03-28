import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PaymentsRepository } from './payments.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentStatus } from '@prisma/client';
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
    const db = this.tenantPrisma.forTenant(tenantId);
    const order = await db.order.findFirst({ where: { id: orderId } });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Prevent payments on terminal-status orders
    if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(order.status)) {
      throw new BadRequestException(
        `Cannot add payment to an order with status ${order.status}`,
      );
    }

    // Overpayment protection: check existing payments total
    const existingPayments = await db.payment.findMany({
      where: { orderId },
    });
    const totalPaid = existingPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const orderTotal = Number(order.totalPrice ?? 0);
    if (orderTotal > 0 && totalPaid + dto.amount > orderTotal) {
      throw new BadRequestException(
        `Payment would exceed order total. Remaining: ${(orderTotal - totalPaid).toFixed(2)}`,
      );
    }

    const payment = await this.paymentsRepo.create(tenantId, {
      amount: dto.amount,
      method: dto.method,
      reference: dto.reference,
      status: dto.status ?? PaymentStatus.PAID,
      orderId,
    });

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
