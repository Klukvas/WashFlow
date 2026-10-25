import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { SchedulingService } from '../scheduling/scheduling.service';
import { ServicesRepository } from '../services/services.repository';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

type Resource = Record<string, unknown>;
type Lookup = { where: Resource };

const branch = {
  id: 'branch-1',
  tenantId: 'tenant-1',
  isActive: true,
  deletedAt: null,
};
const post = { ...branch, id: 'post-1', branchId: branch.id };
const dto: CreateOrderDto = {
  branchId: branch.id,
  workPostId: post.id,
  clientId: 'client-1',
  vehicleId: 'vehicle-1',
  serviceIds: ['service-1'],
  scheduledStart: '2026-10-16T10:00:00Z',
};

function matches(resource: Resource, where: Resource): boolean {
  return Object.entries(where).every(([key, value]) => resource[key] === value);
}

describe('OrdersService create tenant reservation scope', () => {
  let service: OrdersService;
  let branches: Resource[];
  let posts: Resource[];
  const reserveSlot = jest.fn().mockResolvedValue(undefined);
  const dispatch = jest.fn();
  const created = {
    id: 'order-1',
    tenantId: branch.tenantId,
    branchId: branch.id,
    clientId: dto.clientId,
    workPostId: post.id,
    status: 'BOOKED',
    source: 'INTERNAL',
    scheduledStart: new Date(dto.scheduledStart),
    scheduledEnd: new Date('2026-10-16T10:30:00Z'),
    totalPrice: 50,
    client: { id: dto.clientId, phone: 'operator-client-phone' },
    vehicle: { id: dto.vehicleId },
    services: [{ id: 'order-service-1' }],
  };
  const tx = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: dto.clientId }) },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue({ clientId: dto.clientId }),
    },
    bookingSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    branch: {
      findFirst: jest.fn(({ where }: Lookup) =>
        Promise.resolve(branches.find((row) => matches(row, where)) ?? null),
      ),
    },
    workPost: {
      findFirst: jest.fn(({ where }: Lookup) =>
        Promise.resolve(posts.find((row) => matches(row, where)) ?? null),
      ),
      findMany: jest.fn(({ where }: Lookup) =>
        Promise.resolve(posts.filter((row) => matches(row, where))),
      ),
    },
    employeeProfile: { count: jest.fn().mockResolvedValue(0) },
    order: { create: jest.fn().mockResolvedValue(created) },
  };
  const transaction = jest.fn((run: (client: typeof tx) => unknown) => run(tx));

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T08:00:00Z'));
    jest.clearAllMocks();
    branches = [branch];
    posts = [post];
    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: transaction,
            client: {
              findFirst: jest.fn().mockResolvedValue({ id: dto.clientId }),
            },
            vehicle: {
              findFirst: jest
                .fn()
                .mockResolvedValue({ clientId: dto.clientId }),
            },
            bookingSettings: {
              findUnique: jest.fn().mockResolvedValue(null),
              findFirst: jest.fn().mockResolvedValue(null),
            },
          },
        },
        { provide: OrdersRepository, useValue: {} },
        { provide: SchedulingService, useValue: { reserveSlot } },
        {
          provide: ServicesRepository,
          useValue: {
            findByIds: jest
              .fn()
              .mockResolvedValue([
                { id: 'service-1', price: 50, durationMin: 30 },
              ]),
          },
        },
        { provide: EventDispatcherService, useValue: { dispatch } },
        { provide: IdempotencyService, useValue: {} },
      ],
    }).compile();
    service = module.get(OrdersService);
  });

  afterEach(() => jest.useRealTimers());

  it.each([
    ['foreign tenant', { tenantId: 'tenant-2' }],
    ['soft-deleted', { deletedAt: new Date('2026-10-14') }],
    ['inactive', { isActive: false }],
    ['missing', { id: 'different-branch' }],
  ])(
    'rejects a %s branch before reserving or creating',
    async (_, overrides) => {
      branches = [{ ...branch, ...overrides }];

      await expect(
        service.create(branch.tenantId, dto, 'operator-1'),
      ).rejects.toThrow('Branch not found or inactive');
      expect(reserveSlot).not.toHaveBeenCalled();
      expect(tx.order.create).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['foreign tenant', { tenantId: 'tenant-2' }],
    ['wrong branch', { branchId: 'branch-2' }],
    ['soft-deleted', { deletedAt: new Date('2026-10-14') }],
    ['inactive', { isActive: false }],
    ['missing', { id: 'different-post' }],
  ])(
    'rejects a %s explicit post before reserving or creating',
    async (_, overrides) => {
      posts = [{ ...post, ...overrides }];

      await expect(
        service.create(branch.tenantId, dto, 'operator-1'),
      ).rejects.toThrow('Work post not found or inactive in this branch');
      expect(reserveSlot).not.toHaveBeenCalled();
      expect(tx.order.create).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it('reserves a valid post inside the Serializable transaction and keeps the operator response', async () => {
    await expect(
      service.create(branch.tenantId, dto, 'operator-1'),
    ).resolves.toBe(created);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000,
    });
    expect(reserveSlot).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        tenantId: branch.tenantId,
        workPostId: post.id,
      }),
    );
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ client: true, vehicle: true }),
      }),
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('auto-assignment skips foreign, wrong-branch, deleted and inactive posts', async () => {
    posts = [
      { ...post, id: 'foreign-post', tenantId: 'tenant-2' },
      { ...post, id: 'wrong-branch-post', branchId: 'branch-2' },
      { ...post, id: 'deleted-post', deletedAt: new Date('2026-10-14') },
      { ...post, id: 'inactive-post', isActive: false },
      post,
    ];

    await service.create(
      branch.tenantId,
      { ...dto, workPostId: undefined },
      'operator-1',
    );

    expect(reserveSlot).toHaveBeenCalledTimes(1);
    expect(reserveSlot).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ workPostId: post.id }),
    );
  });
});
