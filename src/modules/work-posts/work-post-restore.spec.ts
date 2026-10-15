import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { WorkPostsRepository } from './work-posts.repository';

describe('WorkPostsRepository restore Prisma validation', () => {
  it('compiles a tenant-scoped restore to SQL without a read-only soft-delete flag', async () => {
    const sqlReached = new Error('Inert adapter reached: no database is used');
    const queryRaw = jest.fn<
      Promise<never>,
      [{ sql: string; args: unknown[] }]
    >(() => Promise.reject(sqlReached));
    const adapter: NonNullable<Prisma.PrismaClientOptions['adapter']> = {
      provider: 'postgres',
      adapterName: 'restore-validation-test',
      connect: () =>
        Promise.resolve({
          provider: 'postgres',
          adapterName: 'restore-validation-test',
          queryRaw,
          executeRaw: () => Promise.reject(sqlReached),
          executeScript: () => Promise.reject(sqlReached),
          startTransaction: () =>
            Promise.resolve({
              provider: 'postgres',
              adapterName: 'restore-validation-test',
              options: { usePhantomQuery: true },
              queryRaw,
              executeRaw: () => Promise.reject(sqlReached),
              commit: () => Promise.resolve(),
              rollback: () => Promise.resolve(),
            }),
          dispose: () => Promise.resolve(),
        }),
    };
    const prisma = new PrismaClient({ adapter });
    const tenantPrisma = new TenantPrismaService(prisma as PrismaService);
    const repository = new WorkPostsRepository(tenantPrisma);
    const tenantId = '00000000-0000-4000-8000-000000000001';
    const workPostId = '00000000-0000-4000-8000-000000000002';

    try {
      // Real Prisma validation must pass before the inert adapter stops execution.
      await expect(repository.restore(tenantId, workPostId)).rejects.toThrow(
        sqlReached,
      );
      expect(queryRaw).toHaveBeenCalledTimes(1);
      const [query] = queryRaw.mock.calls[0];
      expect(query.sql).toContain('UPDATE');
      expect(query.sql).toMatch(/WHERE[\s\S]*"id"[\s\S]*"tenantId"/);
      expect(query.args).toEqual(
        expect.arrayContaining([workPostId, tenantId]),
      );
      expect(query.sql).not.toMatch(/WHERE[\s\S]*"deletedAt" IS NULL/);
    } finally {
      await prisma.$disconnect();
    }
  });
});
