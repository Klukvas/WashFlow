import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { RealtimeSubscriber } from './realtime.subscriber';

@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway, RealtimeService, RealtimeSubscriber],
  exports: [RealtimeService],
})
export class RealtimeModule {}
