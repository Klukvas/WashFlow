import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CleanupService } from './cleanup.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('CleanupService', () => {
  let service: CleanupService;
  let prisma: {
    $transaction: jest.Mock;
  };

  // Shared transaction mock factories so individual tests can inspect calls
  let mockQueryRaw: jest.Mock;
  let mockOrderDeleteMany: jest.Mock;
  let mockVehicleDeleteMany: jest.Mock;
  let mockUserDeleteMany: jest.Mock;
  let mockClientDeleteMany: jest.Mock;
  let mockRoleDeleteMany: jest.Mock;
  let mockServiceDeleteMany: jest.Mock;
  let mockBranchDeleteMany: jest.Mock;

  beforeEach(async () => {
    mockQueryRaw = jest.fn().mockResolvedValue(undefined);
    mockOrderDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    mockVehicleDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    mockUserDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    mockClientDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    mockRoleDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    mockServiceDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    mockBranchDeleteMany = jest.fn().mockResolvedValue({ count: 0 });

    const mockTx = {
      $queryRaw: mockQueryRaw,
      order: { deleteMany: mockOrderDeleteMany },
      vehicle: { deleteMany: mockVehicleDeleteMany },
      user: { deleteMany: mockUserDeleteMany },
      client: { deleteMany: mockClientDeleteMany },
      role: { deleteMany: mockRoleDeleteMany },
      service: { deleteMany: mockServiceDeleteMany },
      branch: { deleteMany: mockBranchDeleteMany },
    };

    prisma = {
      $transaction: jest.fn().mockImplementation((fn) => fn(mockTx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CleanupService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(30) },
        },
      ],
    }).compile();

    service = module.get<CleanupService>(CleanupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should execute hard-delete cleanup in a transaction', async () => {
    await service.handleHardDeleteCleanup();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  describe('transaction callback', () => {
    it('should call $queryRaw for order_services cleanup', async () => {
      await service.handleHardDeleteCleanup();
      expect(mockQueryRaw).toHaveBeenCalledTimes(3);
    });

    it('should call $queryRaw for payments cleanup', async () => {
      await service.handleHardDeleteCleanup();
      // $queryRaw called 3 times: order_services, payments, role_permissions
      const calls = mockQueryRaw.mock.calls;
      expect(calls).toHaveLength(3);
    });

    it('should call $queryRaw for role_permissions cleanup', async () => {
      await service.handleHardDeleteCleanup();
      expect(mockQueryRaw).toHaveBeenCalledTimes(3);
    });

    it('should call order.deleteMany within the transaction', async () => {
      await service.handleHardDeleteCleanup();
      expect(mockOrderDeleteMany).toHaveBeenCalledTimes(1);
      expect(mockOrderDeleteMany).toHaveBeenCalledWith({
        where: { deletedAt: { not: null, lt: expect.any(Date) } },
      });
    });

    it('should call vehicle.deleteMany within the transaction', async () => {
      await service.handleHardDeleteCleanup();
      expect(mockVehicleDeleteMany).toHaveBeenCalledTimes(1);
      expect(mockVehicleDeleteMany).toHaveBeenCalledWith({
        where: { deletedAt: { not: null, lt: expect.any(Date) } },
      });
    });

    it('should call user.deleteMany within the transaction', async () => {
      await service.handleHardDeleteCleanup();
      expect(mockUserDeleteMany).toHaveBeenCalledTimes(1);
      expect(mockUserDeleteMany).toHaveBeenCalledWith({
        where: { deletedAt: { not: null, lt: expect.any(Date) } },
      });
    });

    it('should call client.deleteMany within the transaction', async () => {
      await service.handleHardDeleteCleanup();
      expect(mockClientDeleteMany).toHaveBeenCalledTimes(1);
      expect(mockClientDeleteMany).toHaveBeenCalledWith({
        where: { deletedAt: { not: null, lt: expect.any(Date) } },
      });
    });

    it('should call role.deleteMany within the transaction', async () => {
      await service.handleHardDeleteCleanup();
      expect(mockRoleDeleteMany).toHaveBeenCalledTimes(1);
      expect(mockRoleDeleteMany).toHaveBeenCalledWith({
        where: { deletedAt: { not: null, lt: expect.any(Date) } },
      });
    });

    it('should call service.deleteMany within the transaction', async () => {
      await service.handleHardDeleteCleanup();
      expect(mockServiceDeleteMany).toHaveBeenCalledTimes(1);
      expect(mockServiceDeleteMany).toHaveBeenCalledWith({
        where: { deletedAt: { not: null, lt: expect.any(Date) } },
      });
    });

    it('should call branch.deleteMany within the transaction', async () => {
      await service.handleHardDeleteCleanup();
      expect(mockBranchDeleteMany).toHaveBeenCalledTimes(1);
      expect(mockBranchDeleteMany).toHaveBeenCalledWith({
        where: { deletedAt: { not: null, lt: expect.any(Date) } },
      });
    });

    it('should pass a cutoff date approximately 30 days in the past', async () => {
      const before = Date.now();
      await service.handleHardDeleteCleanup();
      const after = Date.now();

      const callArg = mockOrderDeleteMany.mock.calls[0][0];
      const cutoff: Date = callArg.where.deletedAt.lt;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - thirtyDaysMs);
      expect(cutoff.getTime()).toBeLessThanOrEqual(after - thirtyDaysMs + 100);
    });
  });

  describe('error handling', () => {
    it('should catch and log the error when $transaction throws, without rethrowing', async () => {
      const transactionError = new Error('DB connection lost');
      prisma.$transaction.mockRejectedValue(transactionError);

      await expect(service.handleHardDeleteCleanup()).resolves.toBeUndefined();
    });

    it('should not propagate transaction errors to the caller', async () => {
      prisma.$transaction.mockRejectedValue(new Error('Deadlock detected'));

      let thrownError: unknown;
      try {
        await service.handleHardDeleteCleanup();
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeUndefined();
    });
  });
});
