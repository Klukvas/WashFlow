import { Global, Module } from '@nestjs/common';
import { EventDispatcherService } from './event-dispatcher.service';

@Global()
@Module({
  providers: [EventDispatcherService],
  exports: [EventDispatcherService],
})
export class EventsModule {}
