import { EventEmitter } from 'node:events';
import { ConflictException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../prisma/prisma.service';
import { runReservationTransaction } from './reservation-transaction.util';

/** Real installed Prisma + pg adapter error translation; the pg connection is inert. */
async function inertPostgres(
  sqlState: string,
  failures: number,
  phase: 'SELECT' | 'COMMIT' = 'SELECT',
) {
  const adapter = await new PrismaPg({}).connect();
  const pool = adapter.underlyingDriver();
  let remainingFailures = failures;
  const query = jest.fn(async (config: { text: string }) => {
    if (config.text.startsWith(phase) && remainingFailures-- > 0) {
      throw Object.assign(new Error('inert PostgreSQL query failure'), {
        code: sqlState,
        severity: 'ERROR',
      });
    }
    return { fields: [], rows: [], rowCount: 0 };
  });
  const connection = Object.assign(new EventEmitter(), {
    query,
    release: jest.fn(),
  });
  // Select pg's promise overload rather than its callback/void overload.
  jest
    .spyOn(pool as { connect: () => Promise<unknown> }, 'connect')
    .mockResolvedValue(connection);
  const client = new PrismaClient({
    adapter: {
      provider: 'postgres',
      adapterName: '@prisma/adapter-pg',
      connect: () => Promise.resolve(adapter),
    },
  });
  const transaction = jest.spyOn(client, '$transaction');
  return { client, transaction, query };
}

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('inert Prisma failure', {
    code,
    meta,
    clientVersion: 'test',
  });
}

describe('runReservationTransaction installed Prisma PostgreSQL translation', () => {
  it('confirms raw 40001 is P2010 with the driver cause, while model operations are P2034', async () => {
    for (const raw of [true, false]) {
      const { client } = await inertPostgres('40001', 1);
      try {
        const error: unknown = await client
          .$transaction(async (tx) => {
            if (raw) return tx.$queryRaw`SELECT 1`;
            return tx.order.findMany();
          })
          .catch((failure: unknown) => failure);
        expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
        expect(error).toMatchObject({ code: raw ? 'P2010' : 'P2034' });
        if (raw)
          expect(error).toMatchObject({
            meta: {
              driverAdapterError: {
                cause: {
                  kind: 'TransactionWriteConflict',
                  originalCode: '40001',
                },
              },
            },
          });
      } finally {
        await client.$disconnect();
      }
    }
  });

  it.each(['40001', '40P01'])(
    'retries a raw %s failure as a whole transaction and succeeds on the third attempt',
    async (sqlState) => {
      const { client, transaction } = await inertPostgres(sqlState, 2);
      const reserve = jest.fn(
        (tx: Prisma.TransactionClient) => tx.$queryRaw`SELECT 1`,
      );
      const publish = jest.fn();
      try {
        await runReservationTransaction(
          client as unknown as PrismaService,
          reserve,
        );
        publish();
        expect(transaction).toHaveBeenCalledTimes(3);
        expect(reserve).toHaveBeenCalledTimes(3);
        expect(publish).toHaveBeenCalledTimes(1);
      } finally {
        await client.$disconnect();
      }
    },
  );

  it.each(['40001', '40P01'])(
    'retries installed adapter %s failures at COMMIT on the same bounded path',
    async (sqlState) => {
      const { client, transaction } = await inertPostgres(
        sqlState,
        2,
        'COMMIT',
      );
      try {
        await expect(
          runReservationTransaction(
            client as unknown as PrismaService,
            (tx) => tx.$queryRaw`SELECT 1`,
          ),
        ).resolves.toEqual([]);
        expect(transaction).toHaveBeenCalledTimes(3);
      } finally {
        await client.$disconnect();
      }
    },
  );

  it('returns 409 after three installed adapter COMMIT serialization failures', async () => {
    const { client, transaction } = await inertPostgres('40001', 3, 'COMMIT');
    try {
      await expect(
        runReservationTransaction(
          client as unknown as PrismaService,
          (tx) => tx.$queryRaw`SELECT 1`,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(transaction).toHaveBeenCalledTimes(3);
    } finally {
      await client.$disconnect();
    }
  });

  it('preserves an unrecognized installed adapter COMMIT error without retry', async () => {
    const { client, transaction } = await inertPostgres('42501', 3, 'COMMIT');
    try {
      await expect(
        runReservationTransaction(
          client as unknown as PrismaService,
          (tx) => tx.$queryRaw`SELECT 1`,
        ),
      ).rejects.toMatchObject({
        name: 'DriverAdapterError',
        cause: { originalCode: '42501' },
      });
      expect(transaction).toHaveBeenCalledTimes(1);
    } finally {
      await client.$disconnect();
    }
  });

  it('returns 409 after three raw serialization failures without publishing', async () => {
    const { client, transaction } = await inertPostgres('40001', 3);
    const publish = jest.fn();
    try {
      const request = async () => {
        const result = await runReservationTransaction(
          client as unknown as PrismaService,
          (tx) => tx.$queryRaw`SELECT 1`,
        );
        publish();
        return result;
      };
      await expect(request()).rejects.toBeInstanceOf(ConflictException);
      expect(transaction).toHaveBeenCalledTimes(3);
      expect(publish).not.toHaveBeenCalled();
    } finally {
      await client.$disconnect();
    }
  });

  it('retries the translated P2034 from a model query', async () => {
    const { client, transaction } = await inertPostgres('40001', 1);
    try {
      await expect(
        runReservationTransaction(client as unknown as PrismaService, (tx) =>
          tx.order.findMany(),
        ),
      ).resolves.toEqual([]);
      expect(transaction).toHaveBeenCalledTimes(2);
    } finally {
      await client.$disconnect();
    }
  });

  it.each(['42601', '42501', '23505'])(
    'does not retry a non-concurrency raw PostgreSQL error %s',
    async (sqlState) => {
      const { client, transaction } = await inertPostgres(sqlState, 3);
      try {
        await expect(
          runReservationTransaction(
            client as unknown as PrismaService,
            (tx) => tx.$queryRaw`SELECT 1`,
          ),
        ).rejects.toMatchObject({ code: 'P2010' });
        expect(transaction).toHaveBeenCalledTimes(1);
      } finally {
        await client.$disconnect();
      }
    },
  );
});

describe('runReservationTransaction narrow retry classification', () => {
  it.each([
    [
      'adapter name with wrong kind',
      Object.assign(new Error('inert'), {
        name: 'DriverAdapterError',
        cause: { kind: 'Unknown', originalCode: '40001' },
      }),
    ],
    [
      'adapter name with unknown SQLSTATE',
      Object.assign(new Error('inert'), {
        name: 'DriverAdapterError',
        cause: { kind: 'TransactionWriteConflict', originalCode: '42501' },
      }),
    ],
    [
      'plain error with adapter-looking cause',
      Object.assign(new Error('inert'), {
        cause: { kind: 'TransactionWriteConflict', originalCode: '40001' },
      }),
    ],
    ['P2010 without metadata', knownError('P2010')],
    [
      'P2010 with unknown cause',
      knownError('P2010', {
        driverAdapterError: {
          cause: { kind: 'Unknown', originalCode: '42601' },
        },
      }),
    ],
    [
      'other model error with a concurrency-looking cause',
      knownError('P2025', {
        driverAdapterError: { cause: { originalCode: '40001' } },
      }),
    ],
    [
      'plain error with a P2034 property',
      Object.assign(new Error('plain'), { code: 'P2034' }),
    ],
  ])('does not retry %s', async (_, failure) => {
    const transaction = jest.fn().mockRejectedValue(failure);
    await expect(
      runReservationTransaction(
        { $transaction: transaction } as unknown as PrismaService,
        async () => undefined,
      ),
    ).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
