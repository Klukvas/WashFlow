import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { UsersRepository } from '../users/users.repository';
import { UsersService } from '../users/users.service';
import { BranchesRepository } from '../branches/branches.repository';
import { BranchesService } from '../branches/branches.service';
import { WorkPostsRepository } from '../work-posts/work-posts.repository';
import { WorkPostsService } from '../work-posts/work-posts.service';
import { ServicesRepository } from '../services/services.repository';
import { ServicesService } from '../services/services.service';
import { SubscriptionLimitsService } from './subscription-limits.service';
import { SubscriptionsRepository } from './subscriptions.repository';

jest.mock('argon2', () => ({ hash: jest.fn().mockResolvedValue('hashed') }));

type Resource = 'users' | 'branches' | 'workPosts' | 'services';
type Row = {
  id: string;
  tenantId: string;
  deletedAt: Date | null;
  branchId: string;
  passwordHash?: string;
  price?: Prisma.Decimal;
};
type Where = {
  id?: string;
  tenantId?: string;
  deletedAt?: Date | null | { not: null };
  name?: unknown;
};
type Subscription = {
  maxUsers: number | null;
  maxBranches: number | null;
  maxWorkPosts: number | null;
  maxServices: number | null;
  isTrial: boolean;
  trialEndsAt: Date | null;
  status: string;
  cancelEffectiveAt: Date | null;
};
const resources: Resource[] = ['users', 'branches', 'workPosts', 'services'];

/** Explicit in-memory transaction/row-lock double; this is not PostgreSQL evidence. */
function setup(
  resource: Resource,
  subscriptionOverrides: Partial<Subscription> | null = {},
) {
  let rows: Row[] = ['a', 'b'].map((tenantId) => ({
    id: 'deleted',
    tenantId,
    deletedAt: new Date(),
    branchId: 'branch',
  }));
  const locks = new Map<string, Promise<void>>();
  const subscription: Subscription | null =
    subscriptionOverrides === null
      ? null
      : {
          maxUsers: 1,
          maxBranches: 1,
          maxWorkPosts: 1,
          maxServices: 1,
          isTrial: false,
          trialEndsAt: null,
          status: 'ACTIVE',
          cancelEffectiveAt: null,
          ...subscriptionOverrides,
        };
  const matches = (row: Row, where: Where) =>
    (!where.id || row.id === where.id) &&
    (!where.tenantId || row.tenantId === where.tenantId) &&
    (where.deletedAt === undefined ||
      (where.deletedAt !== null && 'not' in where.deletedAt
        ? row.deletedAt !== null
        : row.deletedAt === where.deletedAt));
  const delegate = {
    count: jest.fn(
      async ({ where }: { where: Where }) =>
        rows.filter((row) => matches(row, where)).length,
    ),
    findFirst: jest.fn(async ({ where }: { where: Where }) =>
      where.name ? null : (rows.find((row) => matches(row, where)) ?? null),
    ),
    create: jest.fn(async ({ data }: { data: Partial<Row> }) => {
      await Promise.resolve();
      const row = {
        id: `created-${rows.length}`,
        tenantId: 'missing',
        deletedAt: null,
        branchId: 'branch',
        ...data,
      };
      rows = [...rows, row];
      return row;
    }),
    update: jest.fn(async ({ where }: { where: Where }) => {
      const found = rows.find((row) => matches(row, where));
      if (!found) throw new Error('Missing tenant-scoped row');
      const restored = { ...found, deletedAt: null };
      rows = rows.map((row) => (row === found ? restored : row));
      return restored;
    }),
  };
  const raw = {
    subscription: { findUnique: jest.fn(async () => subscription) },
    user: delegate,
    branch: delegate,
    workPost: delegate,
    service: delegate,
  };
  const prismaDouble = {
    ...raw,
    $transaction: async <T>(
      operation: (tx: Prisma.TransactionClient) => Promise<T>,
    ) => {
      let release: (() => void) | undefined;
      const tx = {
        ...raw,
        $queryRaw: async (_sql: TemplateStringsArray, tenantId: string) => {
          const previous = locks.get(tenantId) ?? Promise.resolve();
          const held = new Promise<void>((resolve) => {
            release = resolve;
          });
          locks.set(
            tenantId,
            previous.then(() => held),
          );
          await previous;
          return [{ id: tenantId }];
        },
      };
      try {
        return await operation(tx as unknown as Prisma.TransactionClient);
      } finally {
        release?.();
      }
    },
  };
  const tenantDouble = {
    forTenant: (tenantId: string) => {
      const scoped = {
        ...delegate,
        findFirst: async ({ where }: { where: Where }) =>
          delegate.findFirst({ where: { ...where, tenantId } }),
        create: async ({ data }: { data: Partial<Row> }) =>
          delegate.create({ data: { ...data, tenantId } }),
        update: async ({ where }: { where: Where }) =>
          delegate.update({ where: { ...where, tenantId } }),
      };
      return {
        user: scoped,
        branch: {
          ...scoped,
          findFirst: async (args: { where: Where }) =>
            args.where.id === 'branch'
              ? { id: 'branch' }
              : scoped.findFirst(args),
        },
        workPost: scoped,
        service: scoped,
      };
    },
  } as unknown as TenantPrismaService;
  const prisma = prismaDouble as unknown as PrismaService;
  const limits = new SubscriptionLimitsService(
    new SubscriptionsRepository(prisma),
  );
  const services = {
    users: new UsersService(new UsersRepository(tenantDouble), limits, prisma),
    branches: new BranchesService(
      new BranchesRepository(tenantDouble, prisma),
      limits,
    ),
    workPosts: new WorkPostsService(
      new WorkPostsRepository(tenantDouble),
      limits,
      tenantDouble,
    ),
    services: new ServicesService(new ServicesRepository(tenantDouble), limits),
  };
  const create = (tenantId = 'a') => {
    switch (resource) {
      case 'users':
        return services.users.create(tenantId, {
          email: 'test@example.test',
          firstName: 'Test',
          lastName: 'User',
          password: 'test-password',
        });
      case 'branches':
        return services.branches.create(tenantId, {
          name: 'Branch',
          timezone: 'Europe/Kyiv',
        });
      case 'workPosts':
        return services.workPosts.create(tenantId, {
          name: 'Post',
          branchId: 'branch',
        });
      case 'services':
        return services.services.create(tenantId, {
          name: 'Wash',
          price: 12.34,
          durationMin: 30,
        });
    }
  };
  return {
    create,
    restore: (tenantId = 'a', id = 'deleted') =>
      services[resource].restore(tenantId, id),
    active: (tenantId = 'a') =>
      rows.filter((row) => row.tenantId === tenantId && row.deletedAt === null),
    delegate,
  };
}

describe.each(resources)(
  '%s quota concurrency through actual service/repository seams',
  (resource) => {
    it.each(['create', 'restore'] as const)(
      'admits only one of a concurrent create and %s with one remaining slot',
      async (other) => {
        const fixture = setup(resource);
        const results = await Promise.allSettled([
          fixture.create(),
          other === 'create' ? fixture.create() : fixture.restore(),
        ]);
        expect(
          results.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        const rejection = results.find(
          (result) => result.status === 'rejected',
        );
        expect(
          rejection?.status === 'rejected' && rejection.reason,
        ).toBeInstanceOf(ForbiddenException);
        expect(fixture.active()).toHaveLength(1);
      },
    );

    it('keeps tenants independent and counts only the requesting tenant', async () => {
      const fixture = setup(resource);
      await expect(
        Promise.all([fixture.create('a'), fixture.create('b')]),
      ).resolves.toHaveLength(2);
      expect(fixture.active('a')).toHaveLength(1);
      expect(fixture.active('b')).toHaveLength(1);
    });

    it('scopes restore reads and writes to the requesting tenant', async () => {
      const fixture = setup(resource);
      await fixture.restore('b');
      expect(fixture.active('a')).toHaveLength(0);
      expect(fixture.active('b')).toHaveLength(1);
      expect(fixture.delegate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'deleted', tenantId: 'b' } }),
      );
      expect(fixture.delegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'deleted', tenantId: 'b', deletedAt: { not: null } },
        }),
      );
    });

    it.each([
      ['foreign', 'deleted'],
      ['a', 'missing'],
    ])(
      'rejects unavailable restore target %s/%s inside the quota transaction',
      async (tenantId, id) => {
        const fixture = setup(resource, null);
        await expect(fixture.restore(tenantId, id)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(fixture.delegate.update).not.toHaveBeenCalled();
      },
    );

    it('re-reads restore eligibility after waiting for a concurrent restore', async () => {
      const fixture = setup(resource, null);
      const results = await Promise.allSettled([
        fixture.restore(),
        fixture.restore(),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(
        BadRequestException,
      );
      expect(fixture.delegate.update).toHaveBeenCalledTimes(1);
      expect(fixture.active()).toHaveLength(1);
    });

    it('does not count resources already created for another tenant', async () => {
      const fixture = setup(resource);
      await fixture.create('b');
      await fixture.create('a');
      expect(fixture.active('a')).toHaveLength(1);
      expect(fixture.active('b')).toHaveLength(1);
      expect(fixture.delegate.count).toHaveBeenCalledWith({
        where: { tenantId: 'a', deletedAt: null },
      });
    });

    it.each([
      null,
      {
        maxUsers: null,
        maxBranches: null,
        maxWorkPosts: null,
        maxServices: null,
      },
    ])('preserves unlimited compatibility for %p', async (overrides) => {
      const fixture = setup(resource, overrides);
      await expect(
        Promise.all([fixture.create(), fixture.restore()]),
      ).resolves.toHaveLength(2);
      expect(fixture.active()).toHaveLength(2);
    });

    it.each([
      { isTrial: true, trialEndsAt: new Date('2020-01-01') },
      { status: 'PAUSED' },
      { status: 'PAST_DUE' },
      { status: 'CANCELLED', cancelEffectiveAt: null },
    ])('denies create and restore before writing for %p', async (overrides) => {
      const fixture = setup(resource, overrides);
      await expect(fixture.create()).rejects.toBeInstanceOf(ForbiddenException);
      await expect(fixture.restore()).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(fixture.delegate.create).not.toHaveBeenCalled();
      expect(fixture.delegate.update).not.toHaveBeenCalled();
    });
  },
);

describe.each(resources)(
  '%s raw transaction repository helpers',
  (resource) => {
    it('uses only the supplied transaction, enforces tenant scope and preserves response mapping', async () => {
      const row = {
        id: 'resource',
        tenantId: 'a',
        deletedAt: new Date(),
        branchId: 'branch',
        passwordHash: 'private-hash',
        price: new Prisma.Decimal('12.30'),
      };
      const delegate = {
        create: jest.fn().mockResolvedValue(row),
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue({ ...row, deletedAt: null }),
      };
      const tx = {
        user: delegate,
        branch: delegate,
        workPost: delegate,
        service: delegate,
      } as unknown as Prisma.TransactionClient;
      const tenantPrisma = {
        forTenant: jest.fn(() => {
          throw new Error('Must use the quota transaction');
        }),
      };
      const scoped = tenantPrisma as unknown as TenantPrismaService;
      const repositories = {
        users: new UsersRepository(scoped),
        branches: new BranchesRepository(scoped, {} as PrismaService),
        workPosts: new WorkPostsRepository(scoped),
        services: new ServicesRepository(scoped),
      };
      const repository = repositories[resource];
      const data = {
        name: 'Created',
        tenantId: 'foreign',
        passwordHash: 'hash',
      };
      const created = await repository.create('a', data, tx);
      const deleted = await repository.findByIdIncludeDeleted(
        'a',
        'resource',
        tx,
      );
      const restored = await repository.restore('a', 'resource', tx);
      expect(delegate.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { ...data, tenantId: 'a' } }),
      );
      expect(delegate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'resource', tenantId: 'a' } }),
      );
      expect(delegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'resource', tenantId: 'a', deletedAt: { not: null } },
          data: { deletedAt: null },
        }),
      );
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
      if (resource === 'users') {
        for (const response of [created, deleted, restored])
          expect(response).not.toHaveProperty('passwordHash');
      }
      if (resource === 'services') {
        for (const response of [created, deleted, restored])
          expect(response).toHaveProperty('price', 12.3);
      }
    });
  },
);
