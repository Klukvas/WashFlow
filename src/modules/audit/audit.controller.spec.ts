import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

describe('AuditController', () => {
  let controller: AuditController;
  let service: Record<string, jest.Mock>;

  const tenantId = 'tenant-1';

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue({ items: [], meta: { total: 0 } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditController,
        { provide: AuditService, useValue: service },
      ],
    }).compile();

    controller = module.get<AuditController>(AuditController);
  });

  describe('findAll', () => {
    it('should delegate to service.findAll with tenantId, query, and branchId', async () => {
      const query = { page: 1, limit: 20 } as any;
      await controller.findAll(tenantId, 'branch-1', query);
      expect(service.findAll).toHaveBeenCalledWith(tenantId, query, 'branch-1');
    });

    it('should pass null branchId for tenant-level access', async () => {
      const query = {} as any;
      await controller.findAll(tenantId, null, query);
      expect(service.findAll).toHaveBeenCalledWith(tenantId, query, null);
    });

    it('should return the result from service', async () => {
      const expected = { items: [{ id: 'log-1' }], meta: { total: 1 } };
      service.findAll.mockResolvedValue(expected);
      const result = await controller.findAll(tenantId, null, {} as any);
      expect(result).toEqual(expected);
    });
  });
});
