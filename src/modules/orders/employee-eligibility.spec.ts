import { Test } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { SchedulingService } from '../scheduling/scheduling.service';
import { ServicesRepository } from '../services/services.repository';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

type Row = Record<string, unknown>;
type Lookup = { where: Row };

// Interpret the filters against fixtures so a missing eligibility condition fails.
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const actual = row[key];
    if (condition === null || typeof condition !== 'object') {
      return actual === condition;
    }
    const filter = condition as Row;
    if ('not' in filter) return actual !== filter.not;
    if ('notIn' in filter) return !(filter.notIn as unknown[]).includes(actual);
    if ('none' in filter) {
      return !(actual as Row[]).some((item) =>
        matches(item, filter.none as Row),
      );
    }
    if ('lte' in filter)
      return typeof actual === 'string' && actual <= String(filter.lte);
    if ('gte' in filter)
      return typeof actual === 'string' && actual >= String(filter.gte);
    if ('lt' in filter) return (actual as Date) < (filter.lt as Date);
    if ('gt' in filter) return (actual as Date) > (filter.gt as Date);
    return matches(actual as Row, filter);
  });
}

const branch = {
  id: 'branch-1',
  tenantId: 'tenant-1',
  isActive: true,
  deletedAt: null,
  timezone: 'Europe/Kyiv',
};
const employee = {
  id: 'employee-1',
  tenantId: branch.tenantId,
  branchId: branch.id,
  isWorker: true,
  active: true,
  deletedAt: null,
  workStartTime: '08:00',
  workEndTime: '20:00',
  user: { tenantId: branch.tenantId, isActive: true, deletedAt: null },
  branch,
  orders: [],
};
const dto: CreateOrderDto = {
  branchId: branch.id,
  workPostId: 'post-1',
  clientId: 'client-1',
  vehicleId: 'vehicle-1',
  serviceIds: ['service-1'],
  scheduledStart: '2026-10-16T10:00:00Z',
  assignedEmployeeId: employee.id,
};

describe('OrdersService employee eligibility inside booking transaction', () => {
  let service: OrdersService;
  let profiles: Row[];
  let branches: Row[];
  let count: number;
  let durationMin: number;
  const dispatch = jest.fn();
  const tx = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: dto.clientId }) },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue({ clientId: dto.clientId }),
    },
    bookingSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue({
        workingDays: [0, 1, 2, 3, 4, 5, 6],
        maxAdvanceBookingDays: 30,
        bufferTimeMinutes: 5,
      }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: employee.id }]),
    branch: {
      findFirst: jest.fn(({ where }: Lookup) =>
        Promise.resolve(branches.find((item) => matches(item, where)) ?? null),
      ),
    },
    workPost: {
      findFirst: jest.fn().mockResolvedValue({ id: dto.workPostId }),
    },
    employeeProfile: {
      count: jest.fn(() => Promise.resolve(count)),
      findFirst: jest.fn(({ where }: Lookup) =>
        Promise.resolve(profiles.find((item) => matches(item, where)) ?? null),
      ),
    },
    order: {
      create: jest.fn(({ data }: { data: Row }) =>
        Promise.resolve({ id: 'order-1', ...data }),
      ),
    },
  };
  const transaction = jest.fn((run: (client: typeof tx) => unknown) => run(tx));

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T08:00:00Z'));
    jest.clearAllMocks();
    profiles = [employee];
    branches = [branch];
    count = 1;
    durationMin = 30;
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
            employeeProfile: {
              findFirst: jest.fn().mockResolvedValue(employee),
            },
            bookingSettings: {
              findUnique: jest.fn().mockResolvedValue(null),
              findFirst: jest.fn().mockResolvedValue({
                workingDays: [0, 1, 2, 3, 4, 5, 6],
                maxAdvanceBookingDays: 30,
                bufferTimeMinutes: 5,
              }),
            },
          },
        },
        { provide: OrdersRepository, useValue: {} },
        { provide: SchedulingService, useValue: { reserveSlot: jest.fn() } },
        {
          provide: ServicesRepository,
          useValue: {
            findByIds: jest.fn(() =>
              Promise.resolve([{ id: 'service-1', price: 50, durationMin }]),
            ),
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
    ['missing', { id: 'missing' }],
    ['foreign tenant', { tenantId: 'tenant-2' }],
    ['other branch', { branchId: 'branch-2' }],
    ['inactive profile', { active: false }],
    ['deleted profile', { deletedAt: new Date() }],
    ['not a worker', { isWorker: false }],
    ['inactive user', { user: { ...employee.user, isActive: false } }],
    ['deleted user', { user: { ...employee.user, deletedAt: new Date() } }],
    ['foreign user', { user: { ...employee.user, tenantId: 'tenant-2' } }],
    ['inactive branch', { branch: { ...branch, isActive: false } }],
    ['deleted branch', { branch: { ...branch, deletedAt: new Date() } }],
    ['off shift', { workStartTime: '14:00' }],
    ['missing start', { workStartTime: null }],
    ['missing end', { workEndTime: null }],
  ])(
    'rejects explicit %s even with zero configured workers',
    async (_, override) => {
      count = 0;
      profiles = [{ ...employee, ...override }];
      await expect(
        service.create(branch.tenantId, dto, 'owner', undefined, null),
      ).rejects.toThrow(
        'Assigned employee is not available for the requested time in this branch',
      );
      expect(tx.order.create).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it.each(['BOOKED', 'IN_PROGRESS', 'BOOKED_PENDING_CONFIRMATION'])(
    'rejects explicit employee occupied by %s on another post',
    async (status) => {
      profiles = [
        {
          ...employee,
          orders: [
            {
              tenantId: branch.tenantId,
              status,
              deletedAt: null,
              scheduledStart: new Date('2026-10-16T10:00:00Z'),
              scheduledEnd: new Date('2026-10-16T11:00:00Z'),
              workPostId: 'post-2',
            },
          ],
        },
      ];
      await expect(
        service.create(branch.tenantId, dto, 'owner'),
      ).rejects.toThrow(
        'Assigned employee is not available for the requested time in this branch',
      );
      expect(tx.order.create).not.toHaveBeenCalled();
    },
  );

  it('includes buffer time when checking employee conflicts', async () => {
    profiles = [
      {
        ...employee,
        orders: [
          {
            tenantId: branch.tenantId,
            status: 'BOOKED',
            deletedAt: null,
            scheduledStart: new Date('2026-10-16T09:00:00Z'),
            scheduledEnd: new Date('2026-10-16T09:59:00Z'),
          },
        ],
      },
    ];
    await expect(service.create(branch.tenantId, dto, 'owner')).rejects.toThrow(
      'Assigned employee is not available for the requested time in this branch',
    );
  });

  it('accepts an eligible explicit employee and locks the stable employee row', async () => {
    await expect(
      service.create(branch.tenantId, dto, 'owner'),
    ).resolves.toMatchObject({ assignedEmployeeId: employee.id });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.employeeProfile.count).not.toHaveBeenCalled();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.order.create.mock.invocationCallOrder[0],
    );
  });

  it.each(['CANCELLED', 'NO_SHOW', 'COMPLETED'])(
    'ignores %s orders',
    async (status) => {
      profiles = [
        {
          ...employee,
          orders: [
            {
              tenantId: branch.tenantId,
              status,
              deletedAt: null,
              scheduledStart: new Date(dto.scheduledStart),
              scheduledEnd: new Date('2026-10-16T11:00:00Z'),
            },
          ],
        },
      ];
      await expect(
        service.create(branch.tenantId, dto, 'owner'),
      ).resolves.toMatchObject({ assignedEmployeeId: employee.id });
    },
  );

  it('ignores soft-deleted active orders', async () => {
    profiles = [
      {
        ...employee,
        orders: [
          {
            tenantId: branch.tenantId,
            status: 'BOOKED',
            deletedAt: new Date(),
            scheduledStart: new Date(dto.scheduledStart),
            scheduledEnd: new Date('2026-10-16T11:00:00Z'),
          },
        ],
      },
    ];
    await expect(
      service.create(branch.tenantId, dto, 'owner'),
    ).resolves.toMatchObject({ assignedEmployeeId: employee.id });
  });

  it.each([employee.id, undefined])(
    'uses branch local shift hours for assignment %s',
    async (assignedEmployeeId) => {
      // 05:00 UTC is 08:00 in Kyiv; UTC-based shift comparison rejects it.
      await expect(
        service.create(
          branch.tenantId,
          {
            ...dto,
            assignedEmployeeId,
            scheduledStart: '2026-10-16T05:00:00Z',
          },
          'owner',
        ),
      ).resolves.toMatchObject({ assignedEmployeeId: employee.id });
    },
  );

  it('rejects an order that crosses local midnight beyond the shift', async () => {
    branches = [{ ...branch, timezone: 'UTC' }];
    await expect(
      service.create(
        branch.tenantId,
        { ...dto, scheduledStart: '2026-10-16T23:45:00Z' },
        'owner',
      ),
    ).rejects.toThrow(
      'Assigned employee is not available for the requested time in this branch',
    );
  });

  it('auto-assignment uses the same eligibility rules and skips an inactive user', async () => {
    profiles = [
      {
        ...employee,
        id: 'inactive',
        user: { ...employee.user, isActive: false },
      },
      employee,
    ];
    await expect(
      service.create(
        branch.tenantId,
        { ...dto, assignedEmployeeId: undefined },
        'owner',
      ),
    ).resolves.toMatchObject({ assignedEmployeeId: employee.id });
  });

  it('preserves no-profile automatic assignment fallback', async () => {
    count = 0;
    profiles = [];
    await expect(
      service.create(
        branch.tenantId,
        { ...dto, assignedEmployeeId: undefined },
        'owner',
      ),
    ).resolves.toMatchObject({ assignedEmployeeId: undefined });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it.each([
    ['2026-10-16T16:30:00Z', true],
    ['2026-10-16T16:30:01Z', false],
  ])(
    'checks the full shift boundary for %s',
    async (scheduledStart, allowed) => {
      const booking = service.create(
        branch.tenantId,
        { ...dto, scheduledStart },
        'owner',
      );
      if (allowed) {
        await expect(booking).resolves.toMatchObject({
          assignedEmployeeId: employee.id,
        });
      } else {
        await expect(booking).rejects.toThrow(
          'Assigned employee is not available',
        );
      }
    },
  );

  it('rechecks eligibility after acquiring the employee lock', async () => {
    tx.$queryRaw.mockImplementationOnce(() => {
      profiles = [{ ...employee, active: false }];
      return Promise.resolve([{ id: employee.id }]);
    });
    await expect(service.create(branch.tenantId, dto, 'owner')).rejects.toThrow(
      'Assigned employee is not available',
    );
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it.each([employee.id, undefined])(
    'rejects a rollback interval that leaves the shift for assignment %s',
    async (assignedEmployeeId) => {
      durationMin = 90;
      profiles = [
        { ...employee, workStartTime: '03:00', workEndTime: '03:45' },
      ];
      // Both endpoints are 03:xx locally, but 00:50Z is 03:50 before rollback.
      await expect(
        service.create(
          branch.tenantId,
          {
            ...dto,
            assignedEmployeeId,
            scheduledStart: '2026-10-25T00:00:00Z',
          },
          'owner',
        ),
      ).rejects.toThrow('available');
      expect(tx.order.create).not.toHaveBeenCalled();
    },
  );

  it.each([employee.id, undefined])(
    'accepts a rollback interval fully covered by the shift for assignment %s',
    async (assignedEmployeeId) => {
      durationMin = 90;
      profiles = [
        { ...employee, workStartTime: '03:00', workEndTime: '04:00' },
      ];
      await expect(
        service.create(
          branch.tenantId,
          {
            ...dto,
            assignedEmployeeId,
            scheduledStart: '2026-10-25T00:00:00Z',
          },
          'owner',
        ),
      ).resolves.toMatchObject({ assignedEmployeeId: employee.id });
    },
  );
});
