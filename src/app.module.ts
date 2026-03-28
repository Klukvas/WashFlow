import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { LoggerModule } from 'nestjs-pino';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { EmailModule } from './modules/email/email.module';
import { EventsModule } from './common/events/events.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
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
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { CleanupModule } from './modules/cleanup/cleanup.module';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { SupportModule } from './modules/support/support.module';
import {
  CorrelationIdMiddleware,
  CORRELATION_ID_HEADER,
} from './common/middleware/correlation-id.middleware';

@Module({
  imports: [
    // Sentry (must be first)
    SentryModule.forRoot(),

    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // Structured logging (JSON in production, pretty in dev, optional Grafana Loki)
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isDev = config.get<string>('nodeEnv') !== 'production';
        const lokiHost = config.get<string>('grafanaLoki.host', '');
        const lokiUsername = config.get<string>('grafanaLoki.username', '');
        const lokiPassword = config.get<string>('grafanaLoki.password', '');
        const hasLoki = !!(lokiHost && lokiUsername && lokiPassword);

        const getTransport = () => {
          if (isDev) {
            return { target: 'pino-pretty' };
          }
          if (hasLoki) {
            return {
              targets: [
                {
                  target: 'pino-loki',
                  options: {
                    batching: true,
                    interval: 5,
                    host: lokiHost,
                    basicAuth: {
                      username: lokiUsername,
                      password: lokiPassword,
                    },
                    labels: { app: 'washflow', env: 'production' },
                  },
                },
                {
                  target: 'pino/file',
                  options: { destination: 1 },
                },
              ],
            };
          }
          return undefined;
        };

        return {
          pinoHttp: {
            level: isDev ? 'debug' : 'info',
            transport: getTransport(),
            customProps: (req: { headers?: Record<string, unknown> }) => ({
              correlationId: req.headers?.[CORRELATION_ID_HEADER] ?? undefined,
            }),
          },
        };
      },
    }),

    // Rate limiting (active in all environments)
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

    // Email
    EmailModule,

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
    SubscriptionsModule,
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
    MetricsModule,
    SupportModule,
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
    // Apply TenantGuard globally — enforces tenantId isolation; superAdmin can
    // override via x-tenant-id header
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
