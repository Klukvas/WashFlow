import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { SchedulingService } from '../scheduling/scheduling.service';
import { SchedulingRepository } from '../scheduling/scheduling.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { WorkforceRepository } from '../workforce/workforce.repository';
import { ServicesRepository } from '../services/services.repository';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { IdempotencyService } from '../idempotency/idempotency.service';

const TENANT = 'tenant-1';
const BRANCH = 'branch-1';
const START = new Date('2026-10-16T10:00:00Z');
const END = new Date('2026-10-16T10:30:00Z');
type Row = {
  id: string;
  tenantId: string;
  branchId: string;
  workPostId: string | null;
  assignedEmployeeId: string | null;
  status: OrderStatus;
  scheduledStart: Date;
  scheduledEnd: Date;
  deletedAt: Date | null;
};
type Resource = Record<string, unknown>;
type Where = { where: Resource };
const deletedOrder = (id: string, overrides: Partial<Row> = {}): Row => ({
  id,
  tenantId: TENANT,
  branchId: BRANCH,
  workPostId: 'post-1',
  assignedEmployeeId: null,
  status: 'BOOKED',
  scheduledStart: START,
  scheduledEnd: END,
  deletedAt: new Date('2026-10-14'),
  ...overrides,
});
const serializationFailure = () =>
  new Prisma.PrismaClientKnownRequestError('retry', {
    code: 'P2034',
    clientVersion: 'test',
  });
function matches(row: Resource, where: Resource): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value !== null && typeof value === 'object' && 'not' in value) {
      return row[key] !== value.not;
    }
    return row[key] === value;
  });
}

/**
 * Actual OrdersService + SchedulingService + SchedulingRepository, with a deterministic
 * in-memory transaction double. Stable resource locks serialize competing requests;
 * waiting Serializable snapshots are aborted with P2034 and retried. This is a unit
 * regression seam, not a substitute for PostgreSQL SSI/row-lock integration coverage.
 */
function harness(initial: Row[], synchronizeUnprotectedReads = false) {
  let rows = initial;
  let version = 0;
  let failureCount = 0;
  let sequence = 0;
  const locks = new Map<string, Promise<void>>();
  const lockLog: string[] = [];
  const dispatch = jest.fn();
  let reservationReads = 0;
  let releaseReads = () => {};
  const bothReads = new Promise<void>((resolve) => {
    releaseReads = resolve;
  });
  const branch: Resource = {
    id: BRANCH,
    tenantId: TENANT,
    isActive: true,
    deletedAt: null,
    timezone: 'UTC',
  };
  let branches = [branch];
  let posts: Resource[] = ['post-1', 'post-2'].map((id) => ({
    id,
    tenantId: TENANT,
    branchId: BRANCH,
    isActive: true,
    deletedAt: null,
  }));
  let employee: Resource | null = null;
  const settings = {
    bufferTimeMinutes: 10,
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    maxAdvanceBookingDays: 30,
  };
  const bookingSettings = {
    findUnique: jest.fn().mockResolvedValue(settings),
    findFirst: jest.fn().mockResolvedValue(null),
  };
  const busy = (row: Row, start: Date, end: Date) =>
    !row.deletedAt &&
    !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(row.status) &&
    row.scheduledStart < end &&
    row.scheduledEnd > start;
  const transaction = jest.fn(
    async (
      work: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
    ) => {
      const snapshot = version;
      const releases: (() => void)[] = [];
      const writes: Row[] = [];
      const countResult = async (count: number): Promise<number> => {
        if (synchronizeUnprotectedReads) {
          reservationReads++;
          if (reservationReads >= 2) releaseReads();
          // An unsafe check-then-write path is paused after observing an empty
          // slot, so another unprotected reader observes the same empty slot.
          // A stable resource lock supplies its own serialization and never waits here.
          if (releases.length === 0) await bothReads;
        }
        return count;
      };
      const lock = async (key: string) => {
        const previous = locks.get(key) ?? Promise.resolve();
        let release = () => {};
        const current = new Promise<void>((resolve) => {
          release = resolve;
        });
        locks.set(
          key,
          previous.then(() => current),
        );
        await previous;
        releases.push(release);
        lockLog.push(key);
        if (
          options?.isolationLevel === 'Serializable' &&
          version !== snapshot
        ) {
          throw serializationFailure();
        }
      };
      const tx = {
        client: prisma.client,
        vehicle: prisma.vehicle,
        bookingSettings,
        branch: {
          findFirst: jest.fn(({ where }: Where) =>
            Promise.resolve(
              branches.find((row) => matches(row, where)) ?? null,
            ),
          ),
        },
        workPost: {
          findFirst: jest.fn(({ where }: Where) =>
            Promise.resolve(posts.find((row) => matches(row, where)) ?? null),
          ),
          findMany: jest.fn(({ where }: Where) =>
            Promise.resolve(
              posts
                .filter((row) => matches(row, where))
                .sort((a, b) => String(a.id).localeCompare(String(b.id))),
            ),
          ),
        },
        employeeProfile: {
          count: jest.fn().mockResolvedValue(0),
          findFirst: jest.fn(({ where }: Where) => {
            if (!employee) return Promise.resolve(null);
            const {
              orders,
              user,
              branch: employeeBranch,
              workStartTime,
              workEndTime,
              ...fields
            } = where;
            const overlaps = orders as {
              none: {
                scheduledStart: { lt: Date };
                scheduledEnd: { gt: Date };
              };
            };
            const eligible =
              matches(employee, fields) &&
              matches(employee.user as Resource, user as Resource) &&
              matches(branch, employeeBranch as Resource) &&
              String(employee.workStartTime) <=
                (workStartTime as { lte: string }).lte &&
              String(employee.workEndTime) >=
                (workEndTime as { gte: string }).gte &&
              !rows.some(
                (row) =>
                  row.assignedEmployeeId === employee?.id &&
                  busy(
                    row,
                    overlaps.none.scheduledEnd.gt,
                    overlaps.none.scheduledStart.lt,
                  ),
              );
            return Promise.resolve(eligible ? { id: employee.id } : null);
          }),
        },
        order: {
          findFirst: jest.fn(({ where }: Where) =>
            Promise.resolve(rows.find((row) => matches(row, where)) ?? null),
          ),
          count: jest.fn(({ where }: { where: Prisma.OrderWhereInput }) =>
            countResult(
              rows.filter(
                (row) =>
                  row.tenantId === where.tenantId &&
                  row.workPostId === where.workPostId &&
                  busy(
                    row,
                    (where.scheduledEnd as { gt: Date }).gt,
                    (where.scheduledStart as { lt: Date }).lt,
                  ),
              ).length,
            ),
          ),
          update: jest.fn(({ where }: Where) => {
            const row = rows.find((candidate) => matches(candidate, where));
            if (!row) throw new Error('Missing scoped update');
            const updated = { ...row, deletedAt: null };
            writes.push(updated);
            return Promise.resolve(updated);
          }),
          create: jest.fn(({ data }: { data: Row }) => {
            const created = {
              ...data,
              id: `new-${++sequence}`,
              deletedAt: null,
            };
            writes.push(created);
            return Promise.resolve(created);
          }),
        },
        $queryRaw: jest.fn(
          async (strings: TemplateStringsArray, ...values: unknown[]) => {
            const sql = strings.join('?');
            if (sql.includes('FROM work_posts')) {
              await lock(`post:${String(values[0])}:${String(values[1])}`);
              return [{ id: values[0] }];
            }
            if (sql.includes('FROM employee_profiles')) {
              await lock(`employee:${String(values[0])}:${String(values[1])}`);
              return [{ id: values[0] }];
            }
            if (sql.includes('COUNT(*)')) {
              const [tenantId, postId, end, start] = values;
              return [
                {
                  count: BigInt(
                    rows.filter(
                      (row) =>
                        row.tenantId === tenantId &&
                        row.workPostId === postId &&
                        busy(row, start as Date, end as Date),
                    ).length,
                  ),
                },
              ];
            }
            return [];
          },
        ),
      };
      try {
        const result = await work(tx as unknown as Prisma.TransactionClient);
        if (failureCount > 0) {
          failureCount--;
          throw serializationFailure();
        }
        rows = [
          ...rows.filter((row) => !writes.some((write) => write.id === row.id)),
          ...writes,
        ];
        if (writes.length > 0) version++;
        return result;
      } finally {
        releases.forEach((release) => release());
      }
    },
  );
  const prisma = {
    $transaction: transaction,
    bookingSettings,
    client: { findFirst: jest.fn().mockResolvedValue({ id: 'client-1' }) },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue({ clientId: 'client-1' }),
    },
  } as unknown as PrismaService;
  const transactionalOrdersRepo = new OrdersRepository(
    {} as TenantPrismaService,
  );
  const repo = {
    restoreInTransaction: transactionalOrdersRepo.restoreInTransaction.bind(
      transactionalOrdersRepo,
    ),
    findByIdIncludeDeleted: jest.fn((tenantId: string, id: string) =>
      Promise.resolve(
        rows.find((row) => row.tenantId === tenantId && row.id === id) ?? null,
      ),
    ),
    restore: jest.fn(),
  } as unknown as OrdersRepository;
  const schedulingRepo = new SchedulingRepository(
    prisma,
    {} as TenantPrismaService,
  );
  const scheduling = new SchedulingService(
    schedulingRepo,
    prisma,
    {} as TenantPrismaService,
    {} as WorkforceRepository,
  );
  const service = new OrdersService(
    prisma,
    repo,
    scheduling,
    {
      findByIds: jest
        .fn()
        .mockResolvedValue([{ id: 'service-1', price: 50, durationMin: 30 }]),
    } as unknown as ServicesRepository,
    { dispatch } as unknown as EventDispatcherService,
    {} as IdempotencyService,
  );
  return {
    service,
    transaction,
    dispatch,
    lockLog,
    rows: () => rows,
    failTransactions: (count: number) => {
      failureCount = count;
    },
    setBranch: (overrides: Resource) => {
      branches = [{ ...branch, ...overrides }];
    },
    setPost: (overrides: Resource) => {
      posts = [{ ...posts[0], ...overrides }];
    },
    setEmployee: (overrides: Resource = {}) => {
      employee = {
        id: 'employee-1',
        tenantId: TENANT,
        branchId: BRANCH,
        isWorker: true,
        active: true,
        deletedAt: null,
        workStartTime: '08:00',
        workEndTime: '18:00',
        user: { tenantId: TENANT, isActive: true, deletedAt: null },
        ...overrides,
      };
    },
    create: (workPostId = 'post-1', assignedEmployeeId?: string) =>
      service.create(
        TENANT,
        {
          branchId: BRANCH,
          workPostId,
          assignedEmployeeId,
          scheduledStart: START.toISOString(),
          serviceIds: ['service-1'],
          clientId: 'client-1',
          vehicleId: 'vehicle-1',
        },
        'operator-1',
      ),
  };
}

describe('Order create/restore atomic reservation', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T08:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  it.each([null, 'employee-1'])(
    'allows only one of two overlapping restores on an initially empty post (employee=%s)',
    async (assignedEmployeeId) => {
      const h = harness(
        [
          deletedOrder('a', { assignedEmployeeId }),
          deletedOrder('b', { assignedEmployeeId }),
        ],
        true,
      );
      if (assignedEmployeeId) h.setEmployee();
      const results = await Promise.allSettled([
        h.service.restore(TENANT, 'a'),
        h.service.restore(TENANT, 'b'),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(h.rows().filter((row) => !row.deletedAt)).toHaveLength(1);
    },
  );

  it.each([null, 'employee-1'])(
    'allows only one concurrent create/restore on the same post (employee=%s)',
    async (assignedEmployeeId) => {
      const h = harness([deletedOrder('a', { assignedEmployeeId })], true);
      if (assignedEmployeeId) h.setEmployee();
      const results = await Promise.allSettled([
        h.create('post-1', assignedEmployeeId ?? undefined),
        h.service.restore(TENANT, 'a'),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(h.rows().filter((row) => !row.deletedAt)).toHaveLength(1);
      expect(h.dispatch).toHaveBeenCalledTimes(
        results[0].status === 'fulfilled' ? 1 : 0,
      );
    },
  );
});

describe('Order restoration resources, scope and retry outcomes', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T08:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  it.each(['restore/restore', 'create/restore'])(
    'allows one overlapping %s for the same employee on different posts',
    async (pair) => {
      const h = harness([
        deletedOrder('a', { assignedEmployeeId: 'employee-1' }),
        deletedOrder('b', {
          workPostId: 'post-2',
          assignedEmployeeId: 'employee-1',
        }),
      ]);
      h.setEmployee();
      const first =
        pair === 'restore/restore'
          ? h.service.restore(TENANT, 'a')
          : h.create('post-1', 'employee-1');
      const results = await Promise.allSettled([
        first,
        h.service.restore(TENANT, 'b'),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(h.rows().filter((row) => !row.deletedAt)).toHaveLength(1);
    },
  );

  it('rejects sequential restore when another order occupies the buffered post interval', async () => {
    const h = harness([
      deletedOrder('a'),
      deletedOrder('busy', {
        deletedAt: null,
        scheduledStart: new Date('2026-10-16T10:35:00Z'),
        scheduledEnd: new Date('2026-10-16T11:00:00Z'),
      }),
    ]);
    await expect(h.service.restore(TENANT, 'a')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(h.rows().find((row) => row.id === 'a')?.deletedAt).not.toBeNull();
  });

  it('rejects a conflicting employee even when the saved post is null', async () => {
    const h = harness([
      deletedOrder('a', { workPostId: null, assignedEmployeeId: 'employee-1' }),
      deletedOrder('busy', {
        workPostId: 'post-2',
        assignedEmployeeId: 'employee-1',
        deletedAt: null,
      }),
    ]);
    h.setEmployee();
    await expect(h.service.restore(TENANT, 'a')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(h.rows().find((row) => row.id === 'a')?.deletedAt).not.toBeNull();
  });

  it('restores a valid saved post and employee, locking the post first', async () => {
    const h = harness([
      deletedOrder('a', { assignedEmployeeId: 'employee-1' }),
    ]);
    h.setEmployee();
    await expect(h.service.restore(TENANT, 'a', BRANCH)).resolves.toMatchObject(
      {
        id: 'a',
        deletedAt: null,
        workPostId: 'post-1',
        assignedEmployeeId: 'employee-1',
      },
    );
    expect(h.lockLog).toEqual([
      'post:post-1:tenant-1',
      'employee:employee-1:tenant-1',
    ]);
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong tenant', 'tenant-2', null],
    ['wrong branch', TENANT, 'branch-2'],
    ['missing order', TENANT, null],
  ])('rejects %s without restoring a row', async (kind, tenantId, branchId) => {
    const h = harness([deletedOrder('a')]);
    await expect(
      h.service.restore(
        tenantId,
        kind === 'missing order' ? 'missing' : 'a',
        branchId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(h.rows()[0].deletedAt).not.toBeNull();
    expect(h.lockLog).toHaveLength(0);
  });

  it('rejects an order that is no longer deleted inside the transaction', async () => {
    const h = harness([deletedOrder('a', { deletedAt: null })]);
    await expect(h.service.restore(TENANT, 'a')).rejects.toThrow(
      'Order is not deleted',
    );
    expect(h.lockLog).toHaveLength(0);
  });

  it.each([
    ['inactive', { isActive: false }],
    ['deleted', { deletedAt: new Date() }],
    ['foreign', { tenantId: 'tenant-2' }],
  ])('rejects %s branch on restore', async (_, overrides) => {
    const h = harness([deletedOrder('a')]);
    h.setBranch(overrides);
    await expect(h.service.restore(TENANT, 'a')).rejects.toThrow(
      'Branch not found or inactive',
    );
    expect(h.rows()[0].deletedAt).not.toBeNull();
  });

  it.each([
    ['inactive', { isActive: false }],
    ['deleted', { deletedAt: new Date() }],
    ['foreign', { tenantId: 'tenant-2' }],
    ['wrong branch', { branchId: 'branch-2' }],
  ])('rejects %s post on restore', async (_, overrides) => {
    const h = harness([deletedOrder('a')]);
    h.setPost(overrides);
    await expect(h.service.restore(TENANT, 'a')).rejects.toThrow(
      'Work post not found or inactive in this branch',
    );
    expect(h.rows()[0].deletedAt).not.toBeNull();
  });

  it.each([
    ['inactive', { active: false }],
    ['deleted', { deletedAt: new Date() }],
    ['nonworker', { isWorker: false }],
    ['wrong branch', { branchId: 'branch-2' }],
    ['foreign', { tenantId: 'tenant-2' }],
    ['outside shift', { workEndTime: '10:00' }],
    [
      'inactive user',
      { user: { tenantId: TENANT, isActive: false, deletedAt: null } },
    ],
  ])('rejects %s saved employee on restore', async (_, overrides) => {
    const h = harness([
      deletedOrder('a', { assignedEmployeeId: 'employee-1' }),
    ]);
    h.setEmployee(overrides);
    await expect(h.service.restore(TENANT, 'a')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(h.rows()[0].deletedAt).not.toBeNull();
  });

  it.each<OrderStatus>(['COMPLETED', 'CANCELLED', 'NO_SHOW'])(
    'restores terminal %s without reserving the busy post or invalid employee',
    async (status) => {
      const h = harness([
        deletedOrder('a', { status, assignedEmployeeId: 'missing' }),
        deletedOrder('busy', { deletedAt: null }),
      ]);
      await expect(h.service.restore(TENANT, 'a')).resolves.toMatchObject({
        deletedAt: null,
        status,
      });
      expect(h.lockLog).toHaveLength(0);
    },
  );

  it.each<OrderStatus>(['COMPLETED', 'CANCELLED', 'NO_SHOW'])(
    'restores terminal %s history in a closed or deleted branch without claiming occupancy',
    async (status) => {
      for (const overrides of [
        { isActive: false },
        { deletedAt: new Date() },
      ]) {
        const h = harness([deletedOrder('a', { status })]);
        h.setBranch(overrides);
        await expect(
          h.service.restore(TENANT, 'a', BRANCH),
        ).resolves.toMatchObject({ deletedAt: null, status });
        expect(h.lockLog).toHaveLength(0);
      }
    },
  );

  it.each<OrderStatus>(['COMPLETED', 'CANCELLED', 'NO_SHOW'])(
    'rejects terminal %s with a corrupt cross-tenant branch reference',
    async (status) => {
      const h = harness([deletedOrder('a', { status })]);
      h.setBranch({ tenantId: 'tenant-2' });
      await expect(h.service.restore(TENANT, 'a')).rejects.toThrow(
        'Branch not found or inactive',
      );
      expect(h.rows()[0].deletedAt).not.toBeNull();
    },
  );

  it('preserves legacy null resources rather than assigning new ones', async () => {
    const h = harness([
      deletedOrder('a', { workPostId: null, assignedEmployeeId: null }),
    ]);
    await expect(h.service.restore(TENANT, 'a')).resolves.toMatchObject({
      deletedAt: null,
      workPostId: null,
      assignedEmployeeId: null,
    });
    expect(h.lockLog).toHaveLength(0);
  });

  it.each(['create', 'restore'])(
    'retries the whole %s transaction after P2034 and publishes create once after commit',
    async (operation) => {
      const h = harness([deletedOrder('a')]);
      h.failTransactions(2);
      await (operation === 'create'
        ? h.create()
        : h.service.restore(TENANT, 'a'));
      expect(h.transaction).toHaveBeenCalledTimes(3);
      expect(h.rows().filter((row) => !row.deletedAt)).toHaveLength(1);
      expect(h.dispatch).toHaveBeenCalledTimes(operation === 'create' ? 1 : 0);
      for (const [, options] of h.transaction.mock.calls) {
        expect(options).toEqual({
          isolationLevel: 'Serializable',
          timeout: 10000,
        });
      }
    },
  );

  it.each(['create', 'restore'])(
    'returns ConflictException when %s serialization retries are exhausted',
    async (operation) => {
      const h = harness([deletedOrder('a')]);
      h.failTransactions(3);
      await expect(
        operation === 'create' ? h.create() : h.service.restore(TENANT, 'a'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(h.transaction).toHaveBeenCalledTimes(3);
      expect(h.rows().filter((row) => !row.deletedAt)).toHaveLength(0);
      expect(h.dispatch).not.toHaveBeenCalled();
    },
  );

  it('does not retry unrelated database failures or publish an event', async () => {
    const h = harness([]);
    const failure = new Error('database unavailable');
    h.transaction.mockRejectedValueOnce(failure);
    await expect(h.create()).rejects.toBe(failure);
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.dispatch).not.toHaveBeenCalled();
  });
});
