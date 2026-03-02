import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { AuditRepository } from './audit.repository';

const TENANT_ID = 'tenant-abc';
const BRANCH_ID = 'branch-xyz';

const makeQuery = (overrides: Record<string, unknown> = {}) => ({
  page: 1,
  limit: 20,
  ...overrides,
});

const makeAuditEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 'audit-1',
  tenantId: TENANT_ID,
  action: 'ORDER_CREATED',
  performedBy: 'user-1',
  createdAt: new Date('2024-01-15T10:00:00Z'),
  ...overrides,
});

describe('AuditService', () => {
  let service: AuditService;
  let auditRepo: { findAll: jest.Mock };

  beforeEach(async () => {
    auditRepo = {
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: AuditRepository, useValue: auditRepo },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns a paginated response with items and pagination meta', async () => {
      const items = [makeAuditEntry(), makeAuditEntry({ id: 'audit-2' })];
      auditRepo.findAll.mockResolvedValue({ items, total: 2 });

      const result = await service.findAll(TENANT_ID, makeQuery() as any);

      expect(result).toEqual({
        items,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('passes tenantId, query and branchId to the repository', async () => {
      const query = makeQuery();
      auditRepo.findAll.mockResolvedValue({ items: [], total: 0 });

      await service.findAll(TENANT_ID, query as any, BRANCH_ID);

      expect(auditRepo.findAll).toHaveBeenCalledWith(TENANT_ID, query, BRANCH_ID);
    });

    it('defaults branchId to null when not supplied', async () => {
      const query = makeQuery();
      auditRepo.findAll.mockResolvedValue({ items: [], total: 0 });

      await service.findAll(TENANT_ID, query as any);

      expect(auditRepo.findAll).toHaveBeenCalledWith(TENANT_ID, query, null);
    });

    it('passes explicit null branchId through to the repository', async () => {
      const query = makeQuery();
      auditRepo.findAll.mockResolvedValue({ items: [], total: 0 });

      await service.findAll(TENANT_ID, query as any, null);

      expect(auditRepo.findAll).toHaveBeenCalledWith(TENANT_ID, query, null);
    });

    it('calls the repository exactly once per invocation', async () => {
      auditRepo.findAll.mockResolvedValue({ items: [], total: 0 });

      await service.findAll(TENANT_ID, makeQuery() as any);

      expect(auditRepo.findAll).toHaveBeenCalledTimes(1);
    });

    it('returns empty items with zero total when there are no audit entries', async () => {
      auditRepo.findAll.mockResolvedValue({ items: [], total: 0 });

      const result = await service.findAll(TENANT_ID, makeQuery() as any);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('calculates totalPages correctly for partial pages', async () => {
      const items = [makeAuditEntry()];
      auditRepo.findAll.mockResolvedValue({ items, total: 1 });

      // page=1, limit=20, total=1 → totalPages=1
      const result = await service.findAll(TENANT_ID, makeQuery({ page: 1, limit: 20 }) as any);

      expect(result.totalPages).toBe(1);
    });

    it('calculates totalPages correctly when items span multiple pages', async () => {
      const items = Array.from({ length: 5 }, (_, i) => makeAuditEntry({ id: `audit-${i}` }));
      auditRepo.findAll.mockResolvedValue({ items, total: 45 });

      // page=1, limit=5, total=45 → totalPages=9
      const result = await service.findAll(TENANT_ID, makeQuery({ page: 1, limit: 5 }) as any);

      expect(result.totalPages).toBe(9);
    });

    it('reflects the current page in the paginated meta', async () => {
      auditRepo.findAll.mockResolvedValue({ items: [], total: 100 });

      const result = await service.findAll(
        TENANT_ID,
        makeQuery({ page: 3, limit: 10 }) as any,
      );

      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
    });

    it('scopes results to the given branchId', async () => {
      const branchItems = [makeAuditEntry({ id: 'audit-branch-1' })];
      auditRepo.findAll.mockResolvedValue({ items: branchItems, total: 1 });

      const result = await service.findAll(TENANT_ID, makeQuery() as any, BRANCH_ID);

      expect(auditRepo.findAll).toHaveBeenCalledWith(TENANT_ID, expect.anything(), BRANCH_ID);
      expect(result.items).toEqual(branchItems);
    });

    it('returns a new response object and does not mutate the query DTO', async () => {
      const query = makeQuery();
      const frozen = Object.freeze({ ...query });
      auditRepo.findAll.mockResolvedValue({ items: [], total: 0 });

      await expect(
        service.findAll(TENANT_ID, frozen as any),
      ).resolves.not.toThrow();
    });

    it('propagates repository errors', async () => {
      auditRepo.findAll.mockRejectedValue(new Error('DB read error'));

      await expect(
        service.findAll(TENANT_ID, makeQuery() as any),
      ).rejects.toThrow('DB read error');
    });
  });
});
