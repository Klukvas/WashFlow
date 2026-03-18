import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyRepository } from './idempotency.repository';
import { PrismaService } from '../../prisma/prisma.service';

describe('IdempotencyRepository', () => {
  let repo: IdempotencyRepository;
  let prisma: any;

  const tenantId = 'tenant-1';
  const key = 'idem-key-123';
  const mockRecord = {
    id: 'idem-1',
    tenantId,
    key,
    statusCode: 201,
    responseBody: {},
  };

  const mockTx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'idem-1' }]),
    idempotencyKey: {
      findUnique: jest.fn().mockResolvedValue(mockRecord),
      update: jest.fn().mockResolvedValue(mockRecord),
    },
  };

  beforeEach(async () => {
    prisma = {
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue(mockRecord),
        upsert: jest.fn().mockResolvedValue(mockRecord),
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
    } as any;

    jest.clearAllMocks();
    mockTx.$queryRaw.mockResolvedValue([{ id: 'idem-1' }]);
    mockTx.idempotencyKey.findUnique.mockResolvedValue(mockRecord);
    mockTx.idempotencyKey.update.mockResolvedValue(mockRecord);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repo = module.get<IdempotencyRepository>(IdempotencyRepository);
  });

  describe('findByKey', () => {
    it('finds idempotency record by composite tenantId+key', async () => {
      const result = await repo.findByKey(tenantId, key);
      expect(prisma.idempotencyKey.findUnique).toHaveBeenCalledWith({
        where: { tenantId_key: { tenantId, key } },
      });
      expect(result).toEqual(mockRecord);
    });
  });

  describe('findByKeyTx', () => {
    it('finds idempotency record within a transaction', async () => {
      const result = await repo.findByKeyTx(mockTx as any, tenantId, key);
      expect(mockTx.idempotencyKey.findUnique).toHaveBeenCalledWith({
        where: { tenantId_key: { tenantId, key } },
      });
      expect(result).toEqual(mockRecord);
    });
  });

  describe('acquireLock', () => {
    it('returns true when lock is acquired (row inserted)', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ id: 'idem-1' }]);
      const data = {
        key,
        tenantId,
        method: 'POST',
        path: '/orders',
        expiresAt: new Date(),
      };
      const result = await repo.acquireLock(mockTx as any, data);
      expect(result).toBe(true);
    });

    it('returns false when lock is not acquired (conflict)', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);
      const data = {
        key,
        tenantId,
        method: 'POST',
        path: '/orders',
        expiresAt: new Date(),
      };
      const result = await repo.acquireLock(mockTx as any, data);
      expect(result).toBe(false);
    });
  });

  describe('saveResult', () => {
    it('updates the idempotency record with status code and response body', async () => {
      const responseBody = { id: 'order-1' };
      await repo.saveResult(mockTx as any, tenantId, key, 201, responseBody);
      expect(mockTx.idempotencyKey.update).toHaveBeenCalledWith({
        where: { tenantId_key: { tenantId, key } },
        data: { statusCode: 201, responseBody },
      });
    });
  });

  describe('upsertResult', () => {
    it('upserts the idempotency record', async () => {
      const data = {
        method: 'POST',
        path: '/orders',
        statusCode: 201,
        responseBody: { id: 'order-1' },
        expiresAt: new Date('2026-03-01'),
      };
      await repo.upsertResult(tenantId, key, data);
      expect(prisma.idempotencyKey.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_key: { tenantId, key } },
          create: expect.objectContaining({ key, tenantId }),
        }),
      );
    });
  });

  describe('deleteExpired', () => {
    it('deletes all records where expiresAt is in the past', async () => {
      const result = await repo.deleteExpired();
      expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
      expect(result).toEqual({ count: 5 });
    });
  });
});
