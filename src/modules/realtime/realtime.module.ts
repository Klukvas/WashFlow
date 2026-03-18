import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { RealtimeSubscriber } from './realtime.subscriber';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
      }),
    }),
  ],
  providers: [RealtimeGateway, RealtimeService, RealtimeSubscriber],
  exports: [RealtimeService],
})
export class RealtimeModule {}
