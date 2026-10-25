import { Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { OrdersService } from '../src/modules/orders/orders.service';
import { OrdersRepository } from '../src/modules/orders/orders.repository';
import { ServicesRepository } from '../src/modules/services/services.repository';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { createP0Harness } from './p0-critical-harness';

const integration =
  process.env.WASHFLOW_REPAIR_TEST_DATABASE_URL !== undefined
    ? describe
    : describe.skip;
integration(
  'P0 order validation uses the occupied transaction connection',
  () => {
    jest.setTimeout(30000);
    let h: Awaited<ReturnType<typeof createP0Harness>>;
    beforeAll(async () => {
      h = await createP0Harness();
    });
    afterAll(async () => {
      if (h) await h.close();
    });

    it.each([true, false])(
      'handles 15 keyed/non-keyed orders with every pool connection held (sequence writes: %s)',
      async (sequenceWrites) => {
        // PrismaService configures max:15. Each callback executes a real query and
        // waits until all 15 independent PostgreSQL backends are inside transactions.
        const fixtures = await Promise.all(
          Array.from({ length: 15 }, () => h.fixture()),
        );
        const backendIds = new Set<number>();
        let previousValidation = Promise.resolve();
        let releaseBarrier: () => void = () => undefined;
        let rejectBarrier: (error: Error) => void = () => undefined;
        const barrier = new Promise<void>((resolve, reject) => {
          releaseBarrier = resolve;
          rejectBarrier = reject;
        });
        const deadline = setTimeout(
          () =>
            rejectBarrier(
              new Error(
                'Not all 15 PostgreSQL transactions reached the barrier',
              ),
            ),
          5000,
        );
        const transaction = async <T>(
          callback: (tx: Prisma.TransactionClient) => Promise<T>,
          options?: {
            maxWait?: number;
            timeout?: number;
            isolationLevel?: Prisma.TransactionIsolationLevel;
          },
        ): Promise<T> =>
          h.prisma.$transaction(async (tx) => {
            const [backend] = await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            backendIds.add(backend.pid);
            const predecessor = previousValidation;
            let releaseValidation: () => void = () => undefined;
            previousValidation = new Promise<void>((resolve) => {
              releaseValidation = resolve;
            });
            if (backendIds.size === 15) releaseBarrier();
            // All 15 connections remain held when the first validation starts.
            // Sequence writes to keep this regression focused on pool use.
            try {
              await barrier;
              if (sequenceWrites) await predecessor;
              return await callback(tx);
            } finally {
              releaseValidation();
            }
          }, options);
        const coordinatedPrisma = new Proxy(h.prisma, {
          get(target, property) {
            if (property === '$transaction') return transaction;
            const value: unknown = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        const tenantPrisma = new TenantPrismaService(h.prisma);
        const orders = new OrdersService(
          coordinatedPrisma,
          new OrdersRepository(tenantPrisma),
          h.scheduling,
          new ServicesRepository(tenantPrisma),
          h.events,
          h.idempotency,
        );
        h.dispatched.mockClear();
        try {
          const results = await Promise.allSettled(
            fixtures.map((fixture, index) =>
              orders.create(
                fixture.tenantId,
                {
                  branchId: fixture.branch.id,
                  clientId: fixture.client.id,
                  vehicleId: fixture.vehicle.id,
                  workPostId: fixture.post.id,
                  scheduledStart: new Date(
                    fixture.start.getTime() + 3600000,
                  ).toISOString(),
                  serviceIds: [fixture.service.id],
                },
                null,
                index % 2 === 0 ? `pool-${index}` : undefined,
              ),
            ),
          );
          expect(backendIds.size).toBe(15);
          const rejected = results.filter(
            (result) => result.status === 'rejected',
          );
          if (sequenceWrites) expect(rejected).toEqual([]);
          else
            for (const result of rejected) {
              expect(result.reason).toBeInstanceOf(ConflictException);
              expect((result.reason as ConflictException).getStatus()).toBe(
                409,
              );
            }
          const ids = results.flatMap((result) =>
            result.status === 'fulfilled' ? [result.value.id] : [],
          );
          expect(new Set(ids).size).toBe(ids.length);
          if (sequenceWrites) expect(ids).toHaveLength(15);
          expect(
            h.dispatched.mock.calls.filter(
              ([event]) => event.eventType === 'order.created',
            ),
          ).toHaveLength(ids.length);
          expect(
            await h.prisma.order.count({
              where: {
                tenantId: { in: fixtures.map((fixture) => fixture.tenantId) },
              },
            }),
          ).toBe(15 + ids.length);
        } finally {
          clearTimeout(deadline);
        }
      },
    );
  },
);
