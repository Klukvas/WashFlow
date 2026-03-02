import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyRepository } from './idempotency.repository';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let repo: {
    findByKey: jest.Mock;
    findByKeyTx: jest.Mock;
    acquireLock: jest.Mock;
    saveResult: jest.Mock;
    upsertResult: jest.Mock;
    deleteExpired: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      findByKey: jest.fn(),
      findByKeyTx: jest.fn(),
      acquireLock: jest.fn(),
      saveResult: jest.fn(),
      upsertResult: jest.fn(),
      deleteExpired: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: IdempotencyRepository, useValue: repo },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('check', () => {
    it('should return hit=false when key not found', async () => {
      repo.findByKey.mockResolvedValue(null);
      const result = await service.check('tenant-1', 'key-1');
      expect(result).toEqual({ hit: false });
    });

    it('should return hit=true with cached response when key exists and not expired', async () => {
      repo.findByKey.mockResolvedValue({
        statusCode: 201,
        responseBody: { id: 'order-1' },
        expiresAt: new Date(Date.now() + 3600000),
      });
      const result = await service.check('tenant-1', 'key-1');
      expect(result.hit).toBe(true);
      expect(result.cachedResponse).toEqual({
        statusCode: 201,
        body: { id: 'order-1' },
      });
    });

    it('should return hit=false when key exists but statusCode is 0 (in progress)', async () => {
      repo.findByKey.mockResolvedValue({
        statusCode: 0,
        responseBody: {},
        expiresAt: new Date(Date.now() + 3600000),
      });
      const result = await service.check('tenant-1', 'key-1');
      expect(result.hit).toBe(false);
    });

    it('should return hit=false when key is expired', async () => {
      repo.findByKey.mockResolvedValue({
        statusCode: 201,
        responseBody: { id: 'order-1' },
        expiresAt: new Date(Date.now() - 1000),
      });
      const result = await service.check('tenant-1', 'key-1');
      expect(result.hit).toBe(false);
    });
  });

  describe('checkTx', () => {
    const mockTx = { id: 'tx-1' } as any;

    it('should return hit=false when key not found in transaction', async () => {
      repo.findByKeyTx.mockResolvedValue(null);
      const result = await service.checkTx(mockTx, 'tenant-1', 'key-1');
      expect(result).toEqual({ hit: false });
      expect(repo.findByKeyTx).toHaveBeenCalledWith(
        mockTx,
        'tenant-1',
        'key-1',
      );
    });

    it('should return hit=true with cached response when key exists and is valid', async () => {
      repo.findByKeyTx.mockResolvedValue({
        statusCode: 200,
        responseBody: { data: 'cached' },
        expiresAt: new Date(Date.now() + 3600000),
      });
      const result = await service.checkTx(mockTx, 'tenant-1', 'key-1');
      expect(result.hit).toBe(true);
      expect(result.cachedResponse).toEqual({
        statusCode: 200,
        body: { data: 'cached' },
      });
    });

    it('should return hit=false when key is expired in transaction', async () => {
      repo.findByKeyTx.mockResolvedValue({
        statusCode: 201,
        responseBody: { id: 'order-2' },
        expiresAt: new Date(Date.now() - 5000),
      });
      const result = await service.checkTx(mockTx, 'tenant-1', 'key-1');
      expect(result.hit).toBe(false);
    });

    it('should return hit=false when statusCode is 0 (in-progress) in transaction', async () => {
      repo.findByKeyTx.mockResolvedValue({
        statusCode: 0,
        responseBody: null,
        expiresAt: new Date(Date.now() + 3600000),
      });
      const result = await service.checkTx(mockTx, 'tenant-1', 'key-1');
      expect(result.hit).toBe(false);
    });

    it('should use findByKeyTx (not findByKey) for the lookup', async () => {
      repo.findByKeyTx.mockResolvedValue(null);
      await service.checkTx(mockTx, 'tenant-1', 'key-1');
      expect(repo.findByKeyTx).toHaveBeenCalledTimes(1);
      expect(repo.findByKey).not.toHaveBeenCalled();
    });
  });

  describe('acquireLockTx', () => {
    it('should return true when lock acquired', async () => {
      repo.acquireLock.mockResolvedValue(true);
      const tx = {} as any;
      const result = await service.acquireLockTx(tx, {
        tenantId: 'tenant-1',
        key: 'key-1',
        method: 'POST',
        path: '/orders',
      });
      expect(result).toBe(true);
    });

    it('should return false when lock not acquired (race condition)', async () => {
      repo.acquireLock.mockResolvedValue(false);
      const tx = {} as any;
      const result = await service.acquireLockTx(tx, {
        tenantId: 'tenant-1',
        key: 'key-1',
        method: 'POST',
        path: '/orders',
      });
      expect(result).toBe(false);
    });
  });

  describe('saveResultTx', () => {
    it('should delegate to repo.saveResult with all arguments', async () => {
      const mockTx = { id: 'tx-save' } as any;
      const expectedReturn = { id: 'idem-1' };
      repo.saveResult.mockResolvedValue(expectedReturn);

      const result = await service.saveResultTx(
        mockTx,
        'tenant-1',
        'key-1',
        201,
        { id: 'order-3' },
      );

      expect(repo.saveResult).toHaveBeenCalledWith(
        mockTx,
        'tenant-1',
        'key-1',
        201,
        { id: 'order-3' },
      );
      expect(result).toBe(expectedReturn);
    });

    it('should pass the statusCode 0 for in-progress marker', async () => {
      const mockTx = {} as any;
      repo.saveResult.mockResolvedValue(null);

      await service.saveResultTx(mockTx, 'tenant-2', 'key-2', 0, null);

      expect(repo.saveResult).toHaveBeenCalledWith(
        mockTx,
        'tenant-2',
        'key-2',
        0,
        null,
      );
    });
  });

  describe('cleanExpired', () => {
    it('should call deleteExpired on repository', async () => {
      repo.deleteExpired.mockResolvedValue({ count: 5 });
      const result = await service.cleanExpired();
      expect(result).toEqual({ count: 5 });
      expect(repo.deleteExpired).toHaveBeenCalled();
    });
  });

  describe('save', () => {
    it('should delegate to repo.upsertResult with the correct TTL-based expiresAt', async () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const expectedExpiresAt = new Date(now + 24 * 3600000);
      repo.upsertResult.mockResolvedValue({ id: 'idem-saved' });

      const result = await service.save('tenant-1', 'key-1', {
        method: 'POST',
        path: '/orders',
        statusCode: 201,
        body: { id: 'order-4' },
      });

      expect(repo.upsertResult).toHaveBeenCalledWith('tenant-1', 'key-1', {
        method: 'POST',
        path: '/orders',
        statusCode: 201,
        responseBody: { id: 'order-4' },
        expiresAt: expectedExpiresAt,
      });
      expect(result).toEqual({ id: 'idem-saved' });

      jest.restoreAllMocks();
    });

    it('should map body to responseBody in the upsertResult call', async () => {
      repo.upsertResult.mockResolvedValue(null);
      const payload = { orders: [1, 2, 3] };

      await service.save('tenant-2', 'key-2', {
        method: 'GET',
        path: '/orders',
        statusCode: 200,
        body: payload,
      });

      const callArg = repo.upsertResult.mock.calls[0][2];
      expect(callArg.responseBody).toBe(payload);
      expect(callArg.body).toBeUndefined();
    });

    it('should compute expiresAt approximately 24 hours in the future', async () => {
      const before = Date.now();
      repo.upsertResult.mockResolvedValue(null);

      await service.save('tenant-1', 'key-1', {
        method: 'POST',
        path: '/test',
        statusCode: 200,
        body: null,
      });

      const after = Date.now();
      const callArg = repo.upsertResult.mock.calls[0][2];
      const expiresAtMs = callArg.expiresAt.getTime();

      expect(expiresAtMs).toBeGreaterThanOrEqual(before + 24 * 3600000);
      expect(expiresAtMs).toBeLessThanOrEqual(after + 24 * 3600000);
    });
  });
});
