import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingHeaderController } from './public-booking-header.controller';
import { PublicBookingService } from './public-booking.service';
import { TenantsRepository } from '../tenants/tenants.repository';
import { SchedulingService } from '../scheduling/scheduling.service';
import { OrdersService } from '../orders/orders.service';
import { ServicesRepository } from '../services/services.repository';
import { BranchesRepository } from '../branches/branches.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';

const tenantId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const serviceId = '33333333-3333-4333-8333-333333333333';
const payload = {
  branchId,
  scheduledStart: '2026-10-20T10:00:00.000Z',
  serviceIds: [serviceId],
  firstName: 'Submitted Alice',
  lastName: 'Submitted Smith',
  phone: '+1234567890',
  licensePlate: 'ABC123',
  vehicleMake: 'Submitted Toyota',
  vehicleModel: 'Submitted Camry',
};
const privateOrder = {
  id: 'order-1',
  tenantId,
  branchId,
  clientId: 'private-client-id',
  vehicleId: 'private-vehicle-id',
  scheduledStart: new Date(payload.scheduledStart),
  scheduledEnd: new Date('2026-10-20T10:30:00.000Z'),
  totalPrice: '35.50',
  notes: 'PRIVATE order notes',
  client: {
    id: 'private-client-id',
    firstName: 'PRIVATE stored name',
    lastName: 'PRIVATE stored surname',
    phone: payload.phone,
    email: 'private-customer@example.test',
    notes: 'PRIVATE client notes',
  },
  vehicle: {
    id: 'private-vehicle-id',
    licensePlate: payload.licensePlate,
    make: 'PRIVATE stored make',
    model: 'PRIVATE stored model',
    vin: 'PRIVATE stored vin',
    photos: ['PRIVATE photo'],
  },
  assignedEmployee: {
    user: { firstName: 'PRIVATE staff', email: 'private-staff@example.test' },
  },
  branch: {
    id: branchId,
    name: 'Main',
    address: 'Public street',
    phone: '+1555000',
    tenantId,
  },
  services: [
    {
      id: 'line-1',
      orderId: 'order-1',
      serviceId,
      price: '35.50',
      quantity: 1,
      service: {
        id: serviceId,
        name: 'Wash',
        durationMin: 30,
        price: '35.50',
        tenantId,
        internal: 'PRIVATE service field',
      },
    },
  ],
};
const expectedConfirmation = {
  id: 'order-1',
  branchId,
  scheduledStart: payload.scheduledStart,
  scheduledEnd: '2026-10-20T10:30:00.000Z',
  totalPrice: 35.5,
  branch: {
    id: branchId,
    name: 'Main',
    address: 'Public street',
    phone: '+1555000',
  },
  client: {
    firstName: payload.firstName,
    lastName: payload.lastName,
    phone: payload.phone,
  },
  vehicle: {
    licensePlate: payload.licensePlate,
    make: payload.vehicleMake,
    model: payload.vehicleModel,
  },
  services: [
    {
      id: 'line-1',
      serviceId,
      price: 35.5,
      quantity: 1,
      service: { id: serviceId, name: 'Wash', durationMin: 30, price: 35.5 },
    },
  ],
};

function assertNoPrivateFields(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    expect([
      'tenantId',
      'clientId',
      'vehicleId',
      'orderId',
      'email',
      'notes',
      'assignedEmployee',
      'user',
      'vin',
      'photos',
      'internal',
    ]).not.toContain(key);
    assertNoPrivateFields(nested);
  }
}

describe('Public booking confirmation privacy', () => {
  let app: INestApplication;
  const create = jest.fn();
  const clientCreate = jest.fn();
  const vehicleCreate = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const tx = {
      client: {
        findFirst: jest.fn().mockResolvedValue(privateOrder.client),
        create: clientCreate,
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue(privateOrder.vehicle),
        create: vehicleCreate,
      },
    };
    const module = await Test.createTestingModule({
      controllers: [PublicBookingController, PublicBookingHeaderController],
      providers: [
        PublicBookingService,
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
        { provide: SchedulingService, useValue: {} },
        { provide: OrdersService, useValue: { create } },
        { provide: ServicesRepository, useValue: {} },
        { provide: BranchesRepository, useValue: {} },
        {
          provide: PrismaService,
          useValue: {
            branch: {
              findFirst: jest.fn().mockResolvedValue(privateOrder.branch),
            },
            bookingSettings: {
              findUnique: jest
                .fn()
                .mockResolvedValue({ allowOnlineBooking: true }),
            },
            $transaction: jest.fn(
              (callback: (transaction: typeof tx) => unknown) => callback(tx),
            ),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe.each([
    ['/api/v1/public/booking/clean-wash/book'],
    ['/api/v1/public/widget/book'],
  ])('%s', (path) => {
    it.each(['created', 'cached'])(
      'returns only safe confirmation fields for a %s order',
      async (resultKind) => {
        // Cached idempotency bodies contain JSON dates/decimals rather than Prisma values.
        const order: unknown =
          resultKind === 'cached'
            ? JSON.parse(JSON.stringify(privateOrder))
            : privateOrder;
        create.mockResolvedValue(order);
        const response = await request(app.getHttpServer())
          .post(path)
          .set('x-carwash-tenant-id', tenantId)
          .set('idempotency-key', 'privacy-regression')
          .send(payload)
          .expect(201);
        const body: unknown = response.body;
        expect(body).toEqual({
          data: expectedConfirmation,
          meta: { timestamp: expect.any(String) },
        });
        assertNoPrivateFields(body);
        expect(JSON.stringify(body)).not.toMatch(/PRIVATE|private-/);
        expect(clientCreate).not.toHaveBeenCalled();
        expect(vehicleCreate).not.toHaveBeenCalled();
        expect(create).toHaveBeenCalledWith(
          tenantId,
          expect.objectContaining({
            clientId: privateOrder.clientId,
            source: 'WEB',
          }),
          null,
          'privacy-regression',
        );
      },
    );

    it('does not fill omitted submitted details from stored client or vehicle records', async () => {
      create.mockResolvedValue(privateOrder);
      const {
        lastName: _lastName,
        vehicleMake: _make,
        vehicleModel: _model,
        ...minimalPayload
      } = payload;
      const response = await request(app.getHttpServer())
        .post(path)
        .set('x-carwash-tenant-id', tenantId)
        .send(minimalPayload)
        .expect(201);
      expect(response.body).toEqual({
        data: {
          ...expectedConfirmation,
          client: {
            firstName: payload.firstName,
            lastName: null,
            phone: payload.phone,
          },
          vehicle: {
            licensePlate: payload.licensePlate,
            make: null,
            model: null,
          },
        },
        meta: { timestamp: expect.any(String) },
      });
      assertNoPrivateFields(response.body);
    });
  });
});
