import { randomUUID } from 'node:crypto';
import { Injectable, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { EventDispatcherService } from '../src/common/events/event-dispatcher.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { JwtPayload } from '../src/common/types/jwt-payload.type';
import { PaymentsController } from '../src/modules/payments/payments.controller';
import { PaymentsRepository } from '../src/modules/payments/payments.repository';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { OrdersController } from '../src/modules/orders/orders.controller';
import { OrdersRepository } from '../src/modules/orders/orders.repository';
import { OrdersService } from '../src/modules/orders/orders.service';
import { SchedulingRepository } from '../src/modules/scheduling/scheduling.repository';
import { SchedulingService } from '../src/modules/scheduling/scheduling.service';
import { WorkforceRepository } from '../src/modules/workforce/workforce.repository';
import { IdempotencyRepository } from '../src/modules/idempotency/idempotency.repository';
import { IdempotencyService } from '../src/modules/idempotency/idempotency.service';
import { PublicBookingService } from '../src/modules/public-booking/public-booking.service';
import { PublicBookingController } from '../src/modules/public-booking/public-booking.controller';
import { PublicBookingHeaderController } from '../src/modules/public-booking/public-booking-header.controller';
import { TenantsRepository } from '../src/modules/tenants/tenants.repository';
import { BranchesRepository } from '../src/modules/branches/branches.repository';
import { AnalyticsController } from '../src/modules/analytics/analytics.controller';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';
import { AnalyticsRepository } from '../src/modules/analytics/analytics.repository';
import { AnalyticsExportService } from '../src/modules/analytics/analytics-export.service';
import { ServicesRepository } from '../src/modules/services/services.repository';

// A test-only JWT strategy establishes explicit synthetic contexts. Production JWT,
// tenant and permission guards still execute; no app module or integrations load.
const syntheticSecret = 'p0-isolated-test-authentication-secret';
@Injectable()
class SyntheticJwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: syntheticSecret,
    });
  }
  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}

export function guardedWorkflowDatabaseUrl(): string {
  const value = process.env.WASHFLOW_REPAIR_TEST_DATABASE_URL;
  const url = new URL(value ?? '');
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '15433' ||
    !/^\/washflow_repair_[a-z0-9_]+$/.test(url.pathname) ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(
      'P0 tests require an isolated washflow_repair_* DB on 127.0.0.1:15433',
    );
  }
  return url.toString();
}

export async function createWorkflowHarness() {
  const prisma = new PrismaService(
    new ConfigService({
      database: { url: guardedWorkflowDatabaseUrl() },
      nodeEnv: 'test',
    }),
  );
  await prisma.$connect();
  const tenantPrisma = new TenantPrismaService(prisma);
  const events = new EventDispatcherService(new EventEmitter2());
  const dispatched = jest.spyOn(events, 'dispatch');
  const idempotency = new IdempotencyService(new IdempotencyRepository(prisma));
  const payments = new PaymentsService(
    new PaymentsRepository(tenantPrisma),
    tenantPrisma,
    events,
    idempotency,
  );
  const scheduling = new SchedulingService(
    new SchedulingRepository(prisma, tenantPrisma),
    prisma,
    tenantPrisma,
    new WorkforceRepository(tenantPrisma),
  );
  const orders = new OrdersService(
    prisma,
    new OrdersRepository(tenantPrisma),
    scheduling,
    new ServicesRepository(tenantPrisma),
    events,
    idempotency,
  );
  const module = await Test.createTestingModule({
    imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
    controllers: [
      AnalyticsController,
      PaymentsController,
      OrdersController,
      PublicBookingController,
      PublicBookingHeaderController,
    ],
    providers: [
      SyntheticJwtStrategy,
      {
        provide: AnalyticsService,
        useValue: new AnalyticsService(new AnalyticsRepository(tenantPrisma)),
      },
      { provide: AnalyticsExportService, useValue: {} },
      {
        provide: PublicBookingService,
        useValue: new PublicBookingService(
          new TenantsRepository(prisma),
          scheduling,
          orders,
          new ServicesRepository(tenantPrisma),
          new BranchesRepository(tenantPrisma, prisma),
          prisma,
        ),
      },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: TenantGuard },
      { provide: PrismaService, useValue: prisma },
      { provide: EventDispatcherService, useValue: events },
      { provide: PaymentsService, useValue: payments },
      { provide: OrdersService, useValue: orders },
      { provide: SchedulingService, useValue: scheduling },
      { provide: IdempotencyService, useValue: idempotency },
    ],
  }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.init();
  const jwt = new JwtService({ secret: syntheticSecret });
  function token(
    tenantId: string,
    overrides: Partial<JwtPayload> = {},
  ): string {
    return jwt.sign({
      sub: randomUUID(),
      tenantId,
      branchId: null,
      isSuperAdmin: false,
      permissions: [
        'payments.read',
        'payments.create',
        'scheduling.read',
        'orders.create',
        'orders.read',
        'orders.update',
        'orders.delete',
        'analytics.view',
      ],
      type: 'access',
      tokenVersion: 0,
      ...overrides,
    });
  }
  async function fixture() {
    const tenant = await prisma.tenant.create({
      data: { name: 'Synthetic P0', slug: `p0-${randomUUID()}` },
    });
    const branch = await prisma.branch.create({
      data: { tenantId: tenant.id, name: 'A', timezone: 'UTC' },
    });
    const otherBranch = await prisma.branch.create({
      data: { tenantId: tenant.id, name: 'B', timezone: 'UTC' },
    });
    const post = await prisma.workPost.create({
      data: { tenantId: tenant.id, branchId: branch.id, name: 'Bay' },
    });
    const otherPost = await prisma.workPost.create({
      data: {
        tenantId: tenant.id,
        branchId: otherBranch.id,
        name: 'Other bay',
      },
    });
    await prisma.bookingSettings.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        workingDays: [0, 1, 2, 3, 4, 5, 6],
        bufferTimeMinutes: 0,
      },
    });
    const client = await prisma.client.create({
      data: { tenantId: tenant.id, firstName: 'Synthetic' },
    });
    const vehicle = await prisma.vehicle.create({
      data: { tenantId: tenant.id, clientId: client.id, make: 'Fixture' },
    });
    const service = await prisma.service.create({
      data: { tenantId: tenant.id, name: 'Wash', price: 100, durationMin: 30 },
    });
    const start = new Date(Date.now() + 86400000);
    start.setUTCHours(12, 0, 0, 0);
    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        clientId: client.id,
        vehicleId: vehicle.id,
        workPostId: post.id,
        scheduledStart: start,
        scheduledEnd: new Date(start.getTime() + 1800000),
        totalPrice: 100,
        status: 'BOOKED',
      },
    });
    return {
      tenantId: tenant.id,
      branch,
      otherBranch,
      post,
      otherPost,
      order,
      client,
      vehicle,
      service,
      start,
    };
  }
  return {
    app,
    prisma,
    payments,
    scheduling,
    orders,
    idempotency,
    dispatched,
    events,
    token,
    fixture,
    close: async () => {
      await app.close();
      await prisma.$disconnect();
    },
  };
}
