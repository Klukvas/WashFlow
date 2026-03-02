import { Test, TestingModule } from '@nestjs/testing';
import { SchedulingRepository } from './scheduling.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

describe('SchedulingRepository', () => {
  let repo: SchedulingRepository;

  const tenantId = 'tenant-1';
  const workPostId = 'wp-1';
  const start = new Date('2026-02-22T10:00:00Z');
  const end = new Date('2026-02-22T11:00:00Z');

  const mockOrders = [
    {
      id: 'order-1',
      scheduledStart: start,
      scheduledEnd: end,
      status: 'PENDING',
    },
  ];

  const mockTx = {
    $queryRaw: jest.fn().mockResolvedValue([{ count: BigInt(2) }]),
  };

  const tenantClient = {
    order: {
      findMany: jest.fn().mockResolvedValue(mockOrders),
    },
  };

  const prisma: Record<string, jest.Mock> = {} as any;

  const tenantPrisma = {
    forTenant: jest.fn().mockReturnValue(tenantClient),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantPrisma.forTenant.mockReturnValue(tenantClient);
    tenantClient.order.findMany.mockResolvedValue(mockOrders);
    mockTx.$queryRaw.mockResolvedValue([{ count: BigInt(2) }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingRepository,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
      ],
    }).compile();

    repo = module.get<SchedulingRepository>(SchedulingRepository);
  });

  describe('lockOverlappingSlots', () => {
    it('executes raw SQL to lock overlapping rows', async () => {
      await repo.lockOverlappingSlots(
        mockTx as any,
        tenantId,
        workPostId,
        start,
        end,
      );
      expect(mockTx.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('countOverlapping', () => {
    it('returns the count as a number (converts from BigInt)', async () => {
      const result = await repo.countOverlapping(
        mockTx as any,
        tenantId,
        workPostId,
        start,
        end,
      );
      expect(result).toBe(2);
      expect(typeof result).toBe('number');
    });
  });

  describe('findOrdersInRange', () => {
    it('returns orders overlapping the given range for a work post', async () => {
      const result = await repo.findOrdersInRange(
        tenantId,
        workPostId,
        start,
        end,
      );
      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(tenantId);
      expect(tenantClient.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workPostId,
            scheduledStart: { lt: end },
            scheduledEnd: { gt: start },
          }),
        }),
      );
      expect(result).toEqual(mockOrders);
    });
  });
});
