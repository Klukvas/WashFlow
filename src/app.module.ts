import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { LoggerModule } from 'nestjs-pino';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { EventsModule } from './common/events/events.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { BranchesModule } from './modules/branches/branches.module';
import { ClientsModule } from './modules/clients/clients.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { ServicesModule } from './modules/services/services.module';
import { WorkPostsModule } from './modules/work-posts/work-posts.module';
import { WorkforceModule } from './modules/workforce/workforce.module';
import { OrdersModule } from './modules/orders/orders.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { PublicBookingModule } from './modules/public-booking/public-booking.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { CleanupModule } from './modules/cleanup/cleanup.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // Structured logging (JSON in production, pretty in dev)
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isDev = config.get<string>('nodeEnv') !== 'production';
        return {
          pinoHttp: {
            level: isDev ? 'debug' : 'info',
            ...(isDev ? { transport: { target: 'pino-pretty' } } : {}),
          },
        };
      },
    }),

    // Rate limiting (CustomThrottlerGuard skips in test env)
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'long', ttl: 60000, limit: 100 },
    ]),

    // Event system
    EventEmitterModule.forRoot(),

    // Scheduled tasks (cron)
    ScheduleModule.forRoot(),

    // BullMQ
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = new URL(
          config.get<string>('redis.url', 'redis://localhost:6379'),
        );
        return {
          connection: {
            host: redisUrl.hostname,
            port: parseInt(redisUrl.port || '6379', 10),
            ...(redisUrl.password
              ? { password: decodeURIComponent(redisUrl.password) }
              : {}),
            ...(redisUrl.username
              ? { username: decodeURIComponent(redisUrl.username) }
              : {}),
          },
        };
      },
    }),

    // Database
    PrismaModule,

    // Domain events
    EventsModule,

    // Feature modules
    AuthModule,
    TenantsModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    BranchesModule,
    ClientsModule,
    VehiclesModule,
    ServicesModule,
    WorkPostsModule,
    WorkforceModule,
    OrdersModule,
    SchedulingModule,
    PaymentsModule,
    AnalyticsModule,
    AuditModule,
    PublicBookingModule,
    RealtimeModule,
    JobsModule,
    CleanupModule,
    HealthModule,
  ],
  providers: [
    // Apply JwtAuthGuard globally — use @Public() to skip
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Apply ThrottlerGuard globally — use @SkipThrottle() to skip
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
