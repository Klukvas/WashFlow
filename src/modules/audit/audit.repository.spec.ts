import { Test, TestingModule } from '@nestjs/testing';
import { AuditRepository } from './audit.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { AuditAction } from '@prisma/client';

describe('AuditRepository', () => {
  let repo: AuditRepository;

  const tenantId = 'tenant-1';
  const mockLog = {
    id: 'log-1',
    tenantId,
    entityType: 'Order',
    action: 'CREATED',
  };

  const tenantClient = {
    auditLog: {
      create: jest.fn().mockResolvedValue(mockLog),
      findMany: jest.fn().mockResolvedValue([mockLog]),
      count: jest.fn().mockResolvedValue(1),
    },
  };

  const tenantPrisma = {
    forTenant: jest.fn().mockReturnValue(tenantClient),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantPrisma.forTenant.mockReturnValue(tenantClient);
    tenantClient.auditLog.create.mockResolvedValue(mockLog);
    tenantClient.auditLog.findMany.mockResolvedValue([mockLog]);
    tenantClient.auditLog.count.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditRepository,
        { provide: TenantPrismaService, useValue: tenantPrisma },
      ],
    }).compile();

    repo = module.get<AuditRepository>(AuditRepository);
  });

  describe('create', () => {
    it('creates an audit log entry', async () => {
      const data = {
        tenantId,
        entityType: 'Order',
        entityId: 'order-1',
        action: 'CREATED' as AuditAction,
      };
      const result = await repo.create(data);
      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(tenantId);
      expect(tenantClient.auditLog.create).toHaveBeenCalledWith({ data });
      expect(result).toEqual(mockLog);
    });
  });

  describe('findAll', () => {
    it('returns paginated audit logs with no filters', async () => {
      const query = { page: 1, limit: 10 } as any;
      const result = await repo.findAll(tenantId, query);
      expect(tenantClient.auditLog.findMany).toHaveBeenCalled();
      expect(tenantClient.auditLog.count).toHaveBeenCalled();
      expect(result).toEqual({ items: [mockLog], total: 1 });
    });

    it('applies entityType filter when provided', async () => {
      const query = { page: 1, limit: 10, entityType: 'Order' } as any;
      await repo.findAll(tenantId, query);
      const callArgs = tenantClient.auditLog.findMany.mock.calls[0][0];
      expect(callArgs.where.entityType).toBe('Order');
    });

    it('applies entityId filter when provided', async () => {
      const query = { page: 1, limit: 10, entityId: 'order-1' } as any;
      await repo.findAll(tenantId, query);
      const callArgs = tenantClient.auditLog.findMany.mock.calls[0][0];
      expect(callArgs.where.entityId).toBe('order-1');
    });

    it('applies action filter when provided', async () => {
      const query = {
        page: 1,
        limit: 10,
        action: 'CREATED' as AuditAction,
      } as any;
      await repo.findAll(tenantId, query);
      const callArgs = tenantClient.auditLog.findMany.mock.calls[0][0];
      expect(callArgs.where.action).toBe('CREATED');
    });

    it('applies dateFrom filter when provided', async () => {
      const query = { page: 1, limit: 10, dateFrom: '2026-01-01' } as any;
      await repo.findAll(tenantId, query);
      const callArgs = tenantClient.auditLog.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt.gte).toEqual(new Date('2026-01-01'));
    });

    it('applies dateTo filter when provided', async () => {
      const query = { page: 1, limit: 10, dateTo: '2026-12-31' } as any;
      await repo.findAll(tenantId, query);
      const callArgs = tenantClient.auditLog.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt.lte).toEqual(new Date('2026-12-31'));
    });

    it('applies branchId metadata filter when branchId is provided', async () => {
      const query = { page: 1, limit: 10 } as any;
      await repo.findAll(tenantId, query, 'branch-1');
      const callArgs = tenantClient.auditLog.findMany.mock.calls[0][0];
      expect(callArgs.where.metadata).toEqual({
        path: ['branchId'],
        equals: 'branch-1',
      });
    });

    it('does not apply branchId filter when branchId is null', async () => {
      const query = { page: 1, limit: 10 } as any;
      await repo.findAll(tenantId, query, null);
      const callArgs = tenantClient.auditLog.findMany.mock.calls[0][0];
      expect(callArgs.where.metadata).toBeUndefined();
    });
  });
});
