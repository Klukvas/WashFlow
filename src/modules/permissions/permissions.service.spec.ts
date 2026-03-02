import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsService } from './permissions.service';
import { PermissionsRepository } from './permissions.repository';

const makePermission = (overrides: Record<string, unknown> = {}) => ({
  id: 'perm-1',
  module: 'orders',
  action: 'READ',
  description: 'View orders',
  ...overrides,
});

describe('PermissionsService', () => {
  let service: PermissionsService;
  let permissionsRepo: { findAll: jest.Mock; findByModule: jest.Mock };

  beforeEach(async () => {
    permissionsRepo = {
      findAll: jest.fn(),
      findByModule: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PermissionsRepository, useValue: permissionsRepo },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all permissions from the repository', async () => {
      const permissions = [
        makePermission(),
        makePermission({ id: 'perm-2', module: 'clients', action: 'WRITE' }),
      ];
      permissionsRepo.findAll.mockResolvedValue(permissions);

      const result = await service.findAll();

      expect(result).toEqual(permissions);
    });

    it('returns an empty array when there are no permissions', async () => {
      permissionsRepo.findAll.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });

    it('delegates to the repository with no arguments', async () => {
      permissionsRepo.findAll.mockResolvedValue([]);

      await service.findAll();

      expect(permissionsRepo.findAll).toHaveBeenCalledTimes(1);
      expect(permissionsRepo.findAll).toHaveBeenCalledWith();
    });

    it('does not invoke findByModule', async () => {
      permissionsRepo.findAll.mockResolvedValue([]);

      await service.findAll();

      expect(permissionsRepo.findByModule).not.toHaveBeenCalled();
    });

    it('propagates repository errors', async () => {
      permissionsRepo.findAll.mockRejectedValue(new Error('DB query failed'));

      await expect(service.findAll()).rejects.toThrow('DB query failed');
    });

    it('returns a large list without truncation', async () => {
      const permissions = Array.from({ length: 200 }, (_, i) =>
        makePermission({ id: `perm-${i}`, action: `ACTION_${i}` }),
      );
      permissionsRepo.findAll.mockResolvedValue(permissions);

      const result = await service.findAll();

      expect(result).toHaveLength(200);
    });
  });

  // ─── findByModule ─────────────────────────────────────────────────────────

  describe('findByModule', () => {
    it('returns permissions filtered by module', async () => {
      const orderPermissions = [
        makePermission({ action: 'READ' }),
        makePermission({ id: 'perm-2', action: 'WRITE' }),
      ];
      permissionsRepo.findByModule.mockResolvedValue(orderPermissions);

      const result = await service.findByModule('orders');

      expect(result).toEqual(orderPermissions);
    });

    it('passes the module name to the repository', async () => {
      permissionsRepo.findByModule.mockResolvedValue([]);

      await service.findByModule('clients');

      expect(permissionsRepo.findByModule).toHaveBeenCalledWith('clients');
      expect(permissionsRepo.findByModule).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array when no permissions exist for the module', async () => {
      permissionsRepo.findByModule.mockResolvedValue([]);

      const result = await service.findByModule('unknown-module');

      expect(result).toEqual([]);
    });

    it('does not invoke findAll', async () => {
      permissionsRepo.findByModule.mockResolvedValue([]);

      await service.findByModule('orders');

      expect(permissionsRepo.findAll).not.toHaveBeenCalled();
    });

    it('handles modules with special characters in the name', async () => {
      permissionsRepo.findByModule.mockResolvedValue([]);

      await service.findByModule('super-admin_module.v2');

      expect(permissionsRepo.findByModule).toHaveBeenCalledWith('super-admin_module.v2');
    });

    it('propagates repository errors', async () => {
      permissionsRepo.findByModule.mockRejectedValue(new Error('Module lookup failed'));

      await expect(service.findByModule('orders')).rejects.toThrow('Module lookup failed');
    });

    it('returns results for each module independently', async () => {
      permissionsRepo.findByModule
        .mockResolvedValueOnce([makePermission({ module: 'orders' })])
        .mockResolvedValueOnce([makePermission({ id: 'perm-2', module: 'clients' })]);

      const ordersResult = await service.findByModule('orders');
      const clientsResult = await service.findByModule('clients');

      expect(ordersResult[0].module).toBe('orders');
      expect(clientsResult[0].module).toBe('clients');
      expect(permissionsRepo.findByModule).toHaveBeenCalledTimes(2);
    });
  });

  // ─── mock isolation ───────────────────────────────────────────────────────

  describe('mock isolation', () => {
    it('findAll and findByModule do not share call state', async () => {
      permissionsRepo.findAll.mockResolvedValue([makePermission()]);

      await service.findAll();

      expect(permissionsRepo.findByModule).not.toHaveBeenCalled();
      expect(permissionsRepo.findAll).toHaveBeenCalledTimes(1);
    });
  });
});
