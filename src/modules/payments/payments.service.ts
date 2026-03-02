import { Injectable } from '@nestjs/common';
import { PaymentsRepository } from './payments.repository';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { EventType } from '../../common/events/event-types';
import { DomainEvent } from '../../common/events/domain-event';
import { CreatePaymentDto } from './dto/create-payment.dto';

class PaymentReceivedEvent extends DomainEvent {
  readonly eventType = EventType.PAYMENT_RECEIVED;
  constructor(
    readonly tenantId: string,
    readonly payload: Record<string, unknown>,
  ) {
    super();
  }
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepo: PaymentsRepository,
    private readonly eventDispatcher: EventDispatcherService,
  ) {}

  async findByOrderId(tenantId: string, orderId: string) {
    return this.paymentsRepo.findByOrderId(tenantId, orderId);
  }

  async create(tenantId: string, orderId: string, dto: CreatePaymentDto) {
    const payment = await this.paymentsRepo.create(tenantId, {
      amount: dto.amount,
      method: dto.method,
      reference: dto.reference,
      status: 'PAID',
      orderId,
    });

    this.eventDispatcher.dispatch(
      new PaymentReceivedEvent(tenantId, {
        paymentId: payment.id,
        orderId,
        amount: dto.amount,
        method: dto.method,
      }),
    );

    return payment;
  }
}
