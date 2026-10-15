import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { EventDispatcherService } from '../src/common/events/event-dispatcher.service';
import { PaymentsRepository } from '../src/modules/payments/payments.repository';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { OrdersRepository } from '../src/modules/orders/orders.repository';
import { OrdersService } from '../src/modules/orders/orders.service';
import { CreateOrderDto } from '../src/modules/orders/dto/create-order.dto';
import { SchedulingRepository } from '../src/modules/scheduling/scheduling.repository';
import { SchedulingService } from '../src/modules/scheduling/scheduling.service';
import { WorkforceRepository } from '../src/modules/workforce/workforce.repository';
import { IdempotencyRepository } from '../src/modules/idempotency/idempotency.repository';
import { IdempotencyService } from '../src/modules/idempotency/idempotency.service';
import { ServicesRepository } from '../src/modules/services/services.repository';
import { ServicesService } from '../src/modules/services/services.service';
import { SubscriptionsRepository } from '../src/modules/subscriptions/subscriptions.repository';
import { SubscriptionLimitsService } from '../src/modules/subscriptions/subscription-limits.service';
import { BranchesRepository } from '../src/modules/branches/branches.repository';
import { BranchesService } from '../src/modules/branches/branches.service';
import { WorkPostsRepository } from '../src/modules/work-posts/work-posts.repository';
import { WorkPostsService } from '../src/modules/work-posts/work-posts.service';
import { UsersRepository } from '../src/modules/users/users.repository';
import { UsersService } from '../src/modules/users/users.service';

type Resource = 'branches' | 'workPosts' | 'users' | 'services';
type Race = 'create/create' | 'create/restore' | 'restore/restore';
const databaseUrl = process.env.WASHFLOW_REPAIR_TEST_DATABASE_URL;
// Opt-in only: the normal E2E suite must never reuse DATABASE_URL for these writes.
const integration = databaseUrl !== undefined ? describe : describe.skip;

integration('repair concurrency — isolated real PostgreSQL', () => {
  jest.setTimeout(30000);
  let prisma: PrismaService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let branches: BranchesService;
  let workPosts: WorkPostsService;
  let services: ServicesService;
  let users: UsersService;

  beforeAll(async () => {
    const url = new URL(databaseUrl ?? '');
    if (
      url.protocol !== 'postgresql:' ||
      url.hostname !== '127.0.0.1' ||
      url.port !== '15433' ||
      !/^\/washflow_repair_[a-z0-9_]+$/.test(url.pathname) ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      throw new Error(
        'Repair tests require an isolated washflow_repair_* DB on 127.0.0.1:15433',
      );
    }
    prisma = new PrismaService(
      new ConfigService({ database: { url: databaseUrl }, nodeEnv: 'test' }),
    );
    await prisma.$connect();
    const tenantPrisma = new TenantPrismaService(prisma);
    // An emitter with no subscribers cannot send email, enqueue work, or call integrations.
    const events = new EventDispatcherService(new EventEmitter2());
    const serviceRepo = new ServicesRepository(tenantPrisma);
    const limits = new SubscriptionLimitsService(
      new SubscriptionsRepository(prisma),
    );
    payments = new PaymentsService(
      new PaymentsRepository(tenantPrisma),
      tenantPrisma,
      events,
    );
    orders = new OrdersService(
      prisma,
      new OrdersRepository(tenantPrisma),
      new SchedulingService(
        new SchedulingRepository(prisma, tenantPrisma),
        prisma,
        tenantPrisma,
        new WorkforceRepository(tenantPrisma),
      ),
      serviceRepo,
      events,
      new IdempotencyService(new IdempotencyRepository(prisma)),
    );
    branches = new BranchesService(
      new BranchesRepository(tenantPrisma, prisma),
      limits,
    );
    workPosts = new WorkPostsService(
      new WorkPostsRepository(tenantPrisma),
      limits,
      tenantPrisma,
    );
    services = new ServicesService(serviceRepo, limits);
    users = new UsersService(new UsersRepository(tenantPrisma), limits, prisma);
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  async function tenant() {
    const token = randomUUID();
    return prisma.tenant.create({
      data: { name: `repair ${token}`, slug: `repair-${token}` },
    });
  }

  async function bookingFixture() {
    const { id: tenantId } = await tenant();
    const branch = await prisma.branch.create({
      data: { tenantId, name: 'Booking', timezone: 'UTC' },
    });
    await prisma.bookingSettings.create({
      data: {
        tenantId,
        branchId: branch.id,
        workingDays: [0, 1, 2, 3, 4, 5, 6],
        bufferTimeMinutes: 0,
      },
    });
    const posts = await Promise.all(
      ['A', 'B'].map((name) =>
        prisma.workPost.create({
          data: { tenantId, branchId: branch.id, name },
        }),
      ),
    );
    const client = await prisma.client.create({
      data: { tenantId, firstName: 'Synthetic' },
    });
    const vehicle = await prisma.vehicle.create({
      data: { tenantId, clientId: client.id, make: 'Synthetic' },
    });
    const service = await prisma.service.create({
      data: { tenantId, name: 'Wash', price: 100, durationMin: 30 },
    });
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `${randomUUID()}@repair.invalid`,
        passwordHash: 'synthetic-unused',
        firstName: 'Worker',
        lastName: 'Fixture',
      },
    });
    const employee = await prisma.employeeProfile.create({
      data: {
        tenantId,
        branchId: branch.id,
        userId: user.id,
        workStartTime: '00:00',
        workEndTime: '23:59',
      },
    });
    const start = new Date(Date.now() + 86400000);
    start.setUTCHours(12, 0, 0, 0);
    const input = {
      tenantId,
      branchId: branch.id,
      clientId: client.id,
      vehicleId: vehicle.id,
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 1800000),
      totalPrice: 100,
    };
    return { tenantId, branch, posts, employee, service, input };
  }

  /** Hold the production lock until PostgreSQL confirms both real requests are waiting. */
  async function contend(
    lock: (tx: Prisma.TransactionClient) => Promise<unknown>,
    operations: readonly [() => Promise<unknown>, () => Promise<unknown>],
    beforeCommit?: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<PromiseSettledResult<unknown>[]> {
    let locked: () => void = () => undefined;
    let unlock: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const holder = prisma.$transaction(
      async (tx) => {
        await lock(tx);
        locked();
        await release;
        await beforeCommit?.(tx);
      },
      { timeout: 15000 },
    );
    await Promise.race([ready, holder]);
    const results = Promise.allSettled(
      operations.map((operation) => operation()),
    );
    try {
      let waiting = 0;
      const deadline = Date.now() + 8000;
      while (waiting < 2 && Date.now() < deadline) {
        const rows = await prisma.$queryRaw<{ count: number }[]>`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
        `;
        waiting = rows[0]?.count ?? 0;
        if (waiting < 2)
          await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting).toBeGreaterThanOrEqual(2);
    } finally {
      unlock();
      await holder;
    }
    return results;
  }

  function createInput(
    fixture: Awaited<ReturnType<typeof bookingFixture>>,
    nullableResources = false,
  ): CreateOrderDto {
    // IsOptional accepts JSON null at the HTTP boundary despite the TS optional-string type.
    return {
      branchId: fixture.branch.id,
      clientId: fixture.input.clientId,
      vehicleId: fixture.input.vehicleId,
      serviceIds: [fixture.service.id],
      scheduledStart: fixture.input.scheduledStart.toISOString(),
      workPostId: nullableResources ? null : fixture.posts[0].id,
      assignedEmployeeId: nullableResources ? null : fixture.employee.id,
    } as unknown as CreateOrderDto;
  }

  it('retries raw locking serialization conflicts after the post row changes', async () => {
    const fixture = await bookingFixture();
    const postId = fixture.posts[0].id;
    const deleted = await prisma.order.create({
      data: {
        ...fixture.input,
        workPostId: postId,
        assignedEmployeeId: fixture.employee.id,
        deletedAt: new Date(),
      },
    });
    const results = await contend(
      (tx) =>
        tx.$queryRaw`SELECT id FROM work_posts WHERE id = ${postId} AND "tenantId" = ${fixture.tenantId} FOR UPDATE`,
      [
        () => orders.restore(fixture.tenantId, deleted.id),
        () => orders.create(fixture.tenantId, createInput(fixture), null),
      ],
      (tx) =>
        tx.$executeRaw`UPDATE work_posts SET name = name WHERE id = ${postId} AND "tenantId" = ${fixture.tenantId}`,
    );
    oneBusinessWinner(results, 'booking');
    expect(
      await prisma.order.count({
        where: {
          tenantId: fixture.tenantId,
          workPostId: postId,
          deletedAt: null,
        },
      }),
    ).toBe(1);
  });

  it('treats explicit null create resources as automatic post and employee assignment', async () => {
    const fixture = await bookingFixture();
    const result = await orders.create(
      fixture.tenantId,
      createInput(fixture, true),
      null,
    );
    expect(fixture.posts.map((post) => post.id)).toContain(result.workPostId);
    expect(result.assignedEmployeeId).toBe(fixture.employee.id);
  });

  it('explicit null create resources cannot bypass the only post capacity', async () => {
    const fixture = await bookingFixture();
    await prisma.workPost.update({
      where: { id: fixture.posts[1].id, tenantId: fixture.tenantId },
      data: { isActive: false },
    });
    const create = () =>
      orders.create(fixture.tenantId, createInput(fixture, true), null);
    const results = await Promise.allSettled([create(), create()]);
    oneBusinessWinner(results, 'booking');
    expect(
      await prisma.order.count({
        where: { tenantId: fixture.tenantId, deletedAt: null },
      }),
    ).toBe(1);
  });

  it('explicit null create resources cannot bypass a foreign branch guard', async () => {
    const fixture = await bookingFixture();
    const foreign = await bookingFixture();
    await expect(
      orders.create(
        fixture.tenantId,
        { ...createInput(fixture, true), branchId: foreign.branch.id },
        null,
      ),
    ).rejects.toThrow('Branch not found or inactive');
    expect(
      await prisma.order.count({ where: { tenantId: fixture.tenantId } }),
    ).toBe(0);
  });

  function oneBusinessWinner(
    results: PromiseSettledResult<unknown>[],
    kind: 'payment' | 'booking' | 'quota',
  ) {
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failures = results.filter((result) => result.status === 'rejected');
    expect(failures).toHaveLength(1);
    for (const result of failures) {
      const reason: unknown = result.reason;
      if (kind === 'payment') {
        expect(reason).toBeInstanceOf(BadRequestException);
        expect((reason as Error).message).toMatch(
          /Payment would exceed order total/,
        );
      } else if (kind === 'quota') {
        expect(reason).toBeInstanceOf(ForbiddenException);
        expect((reason as Error).message).toMatch(/Subscription limit reached/);
      } else {
        expect(
          reason instanceof BadRequestException ||
            reason instanceof ConflictException,
        ).toBe(true);
        expect((reason as Error).message).toMatch(
          /available|reserved|conflict|overlaps with an existing booking/i,
        );
      }
    }
  }

  it('serializes two 75 payments against a 100 order without overpayment', async () => {
    const fixture = await bookingFixture();
    const order = await prisma.order.create({ data: fixture.input });
    const pay = () =>
      payments.create(
        fixture.tenantId,
        order.id,
        { amount: 75, method: 'CASH' },
        'synthetic',
      );
    oneBusinessWinner(
      await contend(
        (tx) =>
          tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} AND "tenantId" = ${fixture.tenantId} FOR UPDATE`,
        [pay, pay],
      ),
      'payment',
    );
    const saved = await prisma.payment.findMany({
      where: { tenantId: fixture.tenantId, orderId: order.id },
    });
    expect(saved).toHaveLength(1);
    expect(
      saved
        .reduce((total, row) => total.plus(row.amount), new Prisma.Decimal(0))
        .toFixed(2),
    ).toBe('75.00');
  });

  it('persists exact concurrent 0.10 + 0.20 payments against a 0.30 order', async () => {
    const fixture = await bookingFixture();
    const order = await prisma.order.create({
      data: { ...fixture.input, totalPrice: new Prisma.Decimal('0.30') },
    });
    const results = await contend(
      (tx) =>
        tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} AND "tenantId" = ${fixture.tenantId} FOR UPDATE`,
      [
        () =>
          payments.create(
            fixture.tenantId,
            order.id,
            { amount: 0.1, method: 'CASH' },
            'synthetic',
          ),
        () =>
          payments.create(
            fixture.tenantId,
            order.id,
            { amount: 0.2, method: 'CARD' },
            'synthetic',
          ),
      ],
    );
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    const saved = await prisma.payment.findMany({
      where: { tenantId: fixture.tenantId, orderId: order.id },
    });
    expect(saved.map((row) => row.amount.toFixed(2)).sort()).toEqual([
      '0.10',
      '0.20',
    ]);
    expect(
      saved
        .reduce((total, row) => total.plus(row.amount), new Prisma.Decimal(0))
        .toFixed(2),
    ).toBe('0.30');
  });

  for (const resource of ['post', 'employee'] as const) {
    for (const race of ['restore/restore', 'create/restore'] as const) {
      it(`${race} reserves one ${resource}${resource === 'employee' ? ' on different posts' : ''}`, async () => {
        const f = await bookingFixture();
        const firstPost = f.posts[0];
        const secondPost = resource === 'employee' ? f.posts[1] : firstPost;
        const deleted = await prisma.order.create({
          data: {
            ...f.input,
            workPostId: firstPost.id,
            assignedEmployeeId: f.employee.id,
            deletedAt: new Date(),
          },
        });
        const second =
          race === 'restore/restore'
            ? await prisma.order.create({
                data: {
                  ...f.input,
                  workPostId: secondPost.id,
                  assignedEmployeeId: f.employee.id,
                  deletedAt: new Date(),
                },
              })
            : null;
        const results = await contend(
          (tx) =>
            resource === 'post'
              ? tx.$queryRaw`SELECT id FROM work_posts WHERE id = ${firstPost.id} AND "tenantId" = ${f.tenantId} FOR UPDATE`
              : tx.$queryRaw`SELECT id FROM employee_profiles WHERE id = ${f.employee.id} AND "tenantId" = ${f.tenantId} FOR UPDATE`,
          [
            () => orders.restore(f.tenantId, deleted.id),
            () =>
              second
                ? orders.restore(f.tenantId, second.id)
                : orders.create(
                    f.tenantId,
                    {
                      branchId: f.branch.id,
                      clientId: f.input.clientId,
                      vehicleId: f.input.vehicleId,
                      workPostId: secondPost.id,
                      assignedEmployeeId: f.employee.id,
                      serviceIds: [f.service.id],
                      scheduledStart: f.input.scheduledStart.toISOString(),
                    },
                    null,
                  ),
          ],
        );
        oneBusinessWinner(results, 'booking');
        expect(
          await prisma.order.count({
            where: {
              tenantId: f.tenantId,
              deletedAt: null,
              status: 'BOOKED',
              ...(resource === 'post'
                ? { workPostId: firstPost.id }
                : { assignedEmployeeId: f.employee.id }),
            },
          }),
        ).toBe(1);
      });
    }
  }

  async function quotaFixture(resource: Resource) {
    const { id: tenantId } = await tenant();
    await prisma.subscription.create({
      data: {
        tenantId,
        status: 'ACTIVE',
        maxBranches: 1,
        maxWorkPosts: 1,
        maxUsers: 1,
        maxServices: 1,
      },
    });
    const branch =
      resource === 'workPosts'
        ? await prisma.branch.create({ data: { tenantId, name: 'Parent' } })
        : null;
    const create = () => {
      const name = `Resource ${randomUUID()}`;
      switch (resource) {
        case 'branches':
          return branches.create(tenantId, { name, timezone: 'UTC' });
        case 'workPosts':
          return workPosts.create(tenantId, {
            name,
            branchId: branch?.id ?? '',
          });
        case 'services':
          return services.create(tenantId, { name, price: 1, durationMin: 30 });
        case 'users':
          return users.create(tenantId, {
            email: `${randomUUID()}@repair.invalid`,
            password: 'SyntheticFixture42',
            firstName: name,
            lastName: 'Fixture',
          });
      }
    };
    const deleted = async () => {
      const row = await create();
      switch (resource) {
        case 'branches':
          await branches.softDelete(tenantId, row.id);
          break;
        case 'workPosts':
          await workPosts.softDelete(tenantId, row.id);
          break;
        case 'services':
          await services.softDelete(tenantId, row.id);
          break;
        case 'users':
          await users.softDelete(tenantId, row.id);
          break;
      }
      return row.id;
    };
    const restore = (id: string) => {
      switch (resource) {
        case 'branches':
          return branches.restore(tenantId, id);
        case 'workPosts':
          return workPosts.restore(tenantId, id);
        case 'services':
          return services.restore(tenantId, id);
        case 'users':
          return users.restore(tenantId, id);
      }
    };
    const count = () => {
      const where = { tenantId, deletedAt: null };
      switch (resource) {
        case 'branches':
          return prisma.branch.count({ where });
        case 'workPosts':
          return prisma.workPost.count({ where });
        case 'services':
          return prisma.service.count({ where });
        case 'users':
          return prisma.user.count({ where });
      }
    };
    return { tenantId, create, deleted, restore, count };
  }

  for (const resource of [
    'branches',
    'workPosts',
    'users',
    'services',
  ] as const) {
    for (const race of [
      'create/create',
      'create/restore',
      'restore/restore',
    ] as const satisfies readonly Race[]) {
      it(`${resource}: ${race} consumes at most one available quota slot`, async () => {
        const f = await quotaFixture(resource);
        const firstId = race !== 'create/create' ? await f.deleted() : null;
        const secondId = race === 'restore/restore' ? await f.deleted() : null;
        const results = await contend(
          (tx) =>
            tx.$queryRaw`SELECT id FROM tenants WHERE id = ${f.tenantId} FOR UPDATE`,
          [
            () =>
              firstId && race === 'restore/restore'
                ? f.restore(firstId)
                : f.create(),
            () =>
              secondId
                ? f.restore(secondId)
                : firstId
                  ? f.restore(firstId)
                  : f.create(),
          ],
        );
        oneBusinessWinner(results, 'quota');
        expect(await f.count()).toBe(1);
      });
    }
  }
});
