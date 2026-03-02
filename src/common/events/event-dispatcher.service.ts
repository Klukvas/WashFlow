import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from './domain-event';

@Injectable()
export class EventDispatcherService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  dispatch(event: DomainEvent): void {
    this.eventEmitter.emit(event.eventType, event);
  }
}
