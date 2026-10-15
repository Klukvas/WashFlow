import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { SchedulingRepository } from '../scheduling/scheduling.repository';
import { SchedulingService } from '../scheduling/scheduling.service';
import { PublicBookingController } from '../public-booking/public-booking.controller';
import { PublicBookingHeaderController } from '../public-booking/public-booking-header.controller';
import { PublicBookingService } from '../public-booking/public-booking.service';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { ServicesRepository } from '../services/services.repository';
import { WorkforceRepository } from '../workforce/workforce.repository';
import { TenantsRepository } from '../tenants/tenants.repository';
import { BranchesRepository } from '../branches/branches.repository';
import { IdempotencyService } from '../idempotency/idempotency.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const serviceId = '33333333-3333-4333-8333-333333333333';
const postId = '44444444-4444-4444-8444-444444444444';
const employeeId = '55555555-5555-4555-8555-555555555555';
const clientId = '66666666-6666-4666-8666-666666666666';
const vehicleId = '77777777-7777-4777-8777-777777777777';
const foreignBranchId = '88888888-8888-4888-8888-888888888888';
const slot = new Date();
slot.setUTCDate(slot.getUTCDate() + 1);
slot.setUTCHours(10, 0, 0, 0);
const commonPayload = {
  branchId,
  serviceIds: [serviceId],
  scheduledStart: slot.toISOString(),
  workPostId: null,
};
const branch = {
  id: branchId,
  tenantId,
  isActive: true,
  deletedAt: null,
  timezone: 'UTC',
  name: 'Main',
  address: null,
  phone: null,
};
const routes = [
  '/api/v1/orders',
  '/api/v1/public/booking/clean-wash/book',
  '/api/v1/public/widget/book',
];

describe('JSON null resources through actual DTO validation, controllers and reservation services', () => {
  let app: INestApplication;
  let ordersCreated: number;
  let employeeEligible: boolean;
  const dispatch = jest.fn();
  const branchRead = jest.fn(
    ({ where }: { where: { id: string; tenantId: string } }) =>
      Promise.resolve(
        where.id === branchId && where.tenantId === tenantId ? branch : null,
      ),
  );
  const raw = jest.fn((parts: TemplateStringsArray) =>
    Promise.resolve(
      parts.join('?').includes('COUNT(*)')
        ? [{ count: BigInt(ordersCreated) }]
        : [],
    ),
  );
  const employeeCount = jest.fn().mockResolvedValue(1);
  const employeeRead = jest.fn(() =>
    Promise.resolve(employeeEligible ? { id: employeeId } : null),
  );
  const create = jest.fn(({ data }: { data: Record<string, unknown> }) => {
    ordersCreated++;
    return Promise.resolve({
      ...data,
      id: 'order-1',
      branch,
      scheduledEnd: new Date(slot.getTime() + 30 * 60000),
      totalPrice: 50,
      services: [
        {
          id: 'line-1',
          serviceId,
          price: 50,
          quantity: 1,
          service: { id: serviceId, name: 'Wash', durationMin: 30, price: 50 },
        },
      ],
    });
  });
  const clientRead = jest.fn().mockResolvedValue({ id: clientId });
  const vehicleRead = jest.fn().mockResolvedValue({ id: vehicleId, clientId });
  const bookingSettings = {
    findUnique: jest.fn().mockResolvedValue({
      workingDays: [0, 1, 2, 3, 4, 5, 6],
      maxAdvanceBookingDays: 30,
      bufferTimeMinutes: 10,
      allowOnlineBooking: true,
    }),
  };
  const tx = {
    branch: { findFirst: branchRead },
    workPost: {
      findMany: jest.fn().mockResolvedValue([{ id: postId }]),
      findFirst: jest.fn().mockResolvedValue({ id: postId }),
    },
    employeeProfile: { count: employeeCount, findFirst: employeeRead },
    order: { create },
    $queryRaw: raw,
    client: { findFirst: clientRead },
    vehicle: { findFirst: vehicleRead },
    bookingSettings,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    ordersCreated = 0;
    employeeEligible = true;
    const module = await Test.createTestingModule({
      controllers: [
        OrdersController,
        PublicBookingController,
        PublicBookingHeaderController,
      ],
      providers: [
        OrdersService,
        SchedulingService,
        SchedulingRepository,
        PublicBookingService,
        { provide: OrdersRepository, useValue: {} },
        {
          provide: PrismaService,
          useValue: {
            ...tx,
            $transaction: (run: (transaction: typeof tx) => unknown) => run(tx),
          },
        },
        { provide: TenantPrismaService, useValue: {} },
        { provide: WorkforceRepository, useValue: {} },
        { provide: BranchesRepository, useValue: {} },
        {
          provide: TenantsRepository,
          useValue: {
            findBySlug: jest
              .fn()
              .mockResolvedValue({ id: tenantId, isActive: true }),
            findById: jest
              .fn()
              .mockResolvedValue({ id: tenantId, isActive: true }),
          },
        },
        {
          provide: ServicesRepository,
          useValue: {
            findByIds: jest
              .fn()
              .mockResolvedValue([
                { id: serviceId, price: 50, durationMin: 30 },
              ]),
          },
        },
        { provide: EventDispatcherService, useValue: { dispatch } },
        { provide: IdempotencyService, useValue: {} },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // Authentication is outside this fixture; inject a tenant-wide authenticated
    // principal so the real parameter decorators and branch scope still execute.
    app.use(
      (
        req: Request & {
          user?: { sub: string; tenantId: string; branchId: null };
        },
        _res: Response,
        next: NextFunction,
      ) => {
        req.user = { sub: 'operator-1', tenantId, branchId: null };
        next();
      },
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  function payload(path: string, override: Record<string, unknown> = {}) {
    return {
      ...commonPayload,
      ...(path === '/api/v1/orders'
        ? { clientId, vehicleId, assignedEmployeeId: null }
        : { firstName: 'Alice', phone: '+1234567890', licensePlate: 'ABC123' }),
      ...override,
    };
  }
  const post = (path: string, override: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post(path)
      .set('x-carwash-tenant-id', tenantId)
      .send(payload(path, override));

  it.each(routes)(
    '%s auto-assigns and locks the post and employee when JSON resources are null',
    async (path) => {
      await post(path).expect(201);
      expect(ordersCreated).toBe(1);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workPostId: postId,
            assignedEmployeeId: employeeId,
          }),
        }),
      );
      expect(branchRead).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: branchId, tenantId, isActive: true, deletedAt: null },
        }),
      );
      expect(employeeCount).toHaveBeenCalledTimes(1);
      expect(employeeRead).toHaveBeenCalled();
      const sql = raw.mock.calls.map(([parts]) => parts.join('?'));
      expect(
        sql.some((statement) => statement.includes('FROM work_posts')),
      ).toBe(true);
      expect(
        sql.some((statement) => statement.includes('FROM employee_profiles')),
      ).toBe(true);
      expect(dispatch).toHaveBeenCalledTimes(1);
    },
  );

  it.each(routes)(
    '%s cannot bypass occupied post capacity by sending null',
    async (path) => {
      ordersCreated = 1;
      await post(path).expect(path === '/api/v1/orders' ? 400 : 409);
      expect(create).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it.each(routes)(
    '%s rejects a foreign branch with null resource fields',
    async (path) => {
      await post(path, { branchId: foreignBranchId }).expect(
        path === '/api/v1/orders' ? 400 : 404,
      );
      expect(create).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it.each(routes)(
    '%s cannot bypass employee capacity with optional null resources',
    async (path) => {
      employeeEligible = false;
      await post(path).expect(path === '/api/v1/orders' ? 400 : 409);
      expect(create).not.toHaveBeenCalled();
      expect(employeeCount).toHaveBeenCalledTimes(1);
      expect(dispatch).not.toHaveBeenCalled();
    },
  );
});
