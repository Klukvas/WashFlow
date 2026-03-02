import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsRepository } from './tenants.repository';

const makeTenant = (overrides: Record<string, unknown> = {}) => ({
  id: 'tenant-1',
  name: 'Wash & Go',
  slug: 'wash-and-go',
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

const makeCreateDto = (overrides: Record<string, unknown> = {}) => ({
  name: 'Wash & Go',
  slug: 'wash-and-go',
  ...overrides,
});

const makeUpdateDto = (overrides: Record<string, unknown> = {}) => ({
  name: 'Wash & Go Updated',
  ...overrides,
});

const makeBookingSettings = (overrides: Record<string, unknown> = {}) => ({
  tenantId: 'tenant-1',
  advanceDays: 7,
  slotDurationMinutes: 30,
  ...overrides,
});

describe('TenantsService', () => {
  let service: TenantsService;
  let tenantsRepo: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findBySlug: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    getBookingSettings: jest.Mock;
  };

  beforeEach(async () => {
    tenantsRepo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      getBookingSettings: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: TenantsRepository, useValue: tenantsRepo },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all tenants from the repository', async () => {
      const tenants = [makeTenant(), makeTenant({ id: 'tenant-2', slug: 'suds-n-bubbles' })];
      tenantsRepo.findAll.mockResolvedValue(tenants);

      const result = await service.findAll();

      expect(result).toEqual(tenants);
    });

    it('returns an empty array when no tenants exist', async () => {
      tenantsRepo.findAll.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });

    it('delegates directly to the repository with no arguments', async () => {
      tenantsRepo.findAll.mockResolvedValue([]);

      await service.findAll();

      expect(tenantsRepo.findAll).toHaveBeenCalledTimes(1);
      expect(tenantsRepo.findAll).toHaveBeenCalledWith();
    });

    it('propagates repository errors', async () => {
      tenantsRepo.findAll.mockRejectedValue(new Error('DB timeout'));

      await expect(service.findAll()).rejects.toThrow('DB timeout');
    });
  });

  // ─── findById ─────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns the tenant when found', async () => {
      const tenant = makeTenant();
      tenantsRepo.findById.mockResolvedValue(tenant);

      const result = await service.findById('tenant-1');

      expect(result).toEqual(tenant);
    });

    it('passes the id to the repository', async () => {
      tenantsRepo.findById.mockResolvedValue(makeTenant());

      await service.findById('tenant-1');

      expect(tenantsRepo.findById).toHaveBeenCalledWith('tenant-1');
    });

    it('throws NotFoundException when the tenant does not exist', async () => {
      tenantsRepo.findById.mockResolvedValue(null);

      await expect(service.findById('unknown-id')).rejects.toThrow(NotFoundException);
    });

    it('includes "Tenant not found" in the NotFoundException message', async () => {
      tenantsRepo.findById.mockResolvedValue(null);

      await expect(service.findById('unknown-id')).rejects.toThrow('Tenant not found');
    });

    it('propagates unexpected repository errors', async () => {
      tenantsRepo.findById.mockRejectedValue(new Error('Query failed'));

      await expect(service.findById('tenant-1')).rejects.toThrow('Query failed');
    });
  });

  // ─── findBySlug ───────────────────────────────────────────────────────────

  describe('findBySlug', () => {
    it('returns the tenant when found by slug', async () => {
      const tenant = makeTenant();
      tenantsRepo.findBySlug.mockResolvedValue(tenant);

      const result = await service.findBySlug('wash-and-go');

      expect(result).toEqual(tenant);
    });

    it('passes the slug to the repository', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(makeTenant());

      await service.findBySlug('wash-and-go');

      expect(tenantsRepo.findBySlug).toHaveBeenCalledWith('wash-and-go');
    });

    it('throws NotFoundException when no tenant matches the slug', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(null);

      await expect(service.findBySlug('no-such-slug')).rejects.toThrow(NotFoundException);
    });

    it('includes "Tenant not found" in the NotFoundException message', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(null);

      await expect(service.findBySlug('no-such-slug')).rejects.toThrow('Tenant not found');
    });

    it('propagates unexpected repository errors', async () => {
      tenantsRepo.findBySlug.mockRejectedValue(new Error('Network error'));

      await expect(service.findBySlug('wash-and-go')).rejects.toThrow('Network error');
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates and returns a new tenant when the slug is available', async () => {
      const dto = makeCreateDto();
      const created = makeTenant();
      tenantsRepo.findBySlug.mockResolvedValue(null);
      tenantsRepo.create.mockResolvedValue(created);

      const result = await service.create(dto as any);

      expect(result).toEqual(created);
    });

    it('calls the repository create with name and slug from the DTO', async () => {
      const dto = makeCreateDto();
      tenantsRepo.findBySlug.mockResolvedValue(null);
      tenantsRepo.create.mockResolvedValue(makeTenant());

      await service.create(dto as any);

      expect(tenantsRepo.create).toHaveBeenCalledWith({
        name: dto.name,
        slug: dto.slug,
      });
    });

    it('checks slug uniqueness before creating', async () => {
      const dto = makeCreateDto();
      tenantsRepo.findBySlug.mockResolvedValue(null);
      tenantsRepo.create.mockResolvedValue(makeTenant());

      await service.create(dto as any);

      expect(tenantsRepo.findBySlug).toHaveBeenCalledWith(dto.slug);
    });

    it('throws ConflictException when the slug is already taken', async () => {
      const dto = makeCreateDto();
      tenantsRepo.findBySlug.mockResolvedValue(makeTenant());

      await expect(service.create(dto as any)).rejects.toThrow(ConflictException);
    });

    it('includes "Slug already in use" in the ConflictException message', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(makeTenant());

      await expect(service.create(makeCreateDto() as any)).rejects.toThrow('Slug already in use');
    });

    it('does not call repository create when the slug is already taken', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(makeTenant());

      await expect(service.create(makeCreateDto() as any)).rejects.toThrow(ConflictException);

      expect(tenantsRepo.create).not.toHaveBeenCalled();
    });

    it('propagates repository create errors', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(null);
      tenantsRepo.create.mockRejectedValue(new Error('Insert failed'));

      await expect(service.create(makeCreateDto() as any)).rejects.toThrow('Insert failed');
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('returns the updated tenant', async () => {
      const updated = makeTenant({ name: 'New Name' });
      tenantsRepo.findById.mockResolvedValue(makeTenant());
      tenantsRepo.update.mockResolvedValue(updated);

      const result = await service.update('tenant-1', makeUpdateDto() as any);

      expect(result).toEqual(updated);
    });

    it('verifies the tenant exists before updating', async () => {
      tenantsRepo.findById.mockResolvedValue(makeTenant());
      tenantsRepo.update.mockResolvedValue(makeTenant());

      await service.update('tenant-1', makeUpdateDto() as any);

      expect(tenantsRepo.findById).toHaveBeenCalledWith('tenant-1');
    });

    it('passes the id and DTO to the repository update', async () => {
      const dto = makeUpdateDto();
      tenantsRepo.findById.mockResolvedValue(makeTenant());
      tenantsRepo.update.mockResolvedValue(makeTenant());

      await service.update('tenant-1', dto as any);

      expect(tenantsRepo.update).toHaveBeenCalledWith('tenant-1', dto);
    });

    it('throws NotFoundException when the tenant does not exist', async () => {
      tenantsRepo.findById.mockResolvedValue(null);

      await expect(
        service.update('unknown-id', makeUpdateDto() as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not call repository update when the tenant is not found', async () => {
      tenantsRepo.findById.mockResolvedValue(null);

      await expect(
        service.update('unknown-id', makeUpdateDto() as any),
      ).rejects.toThrow(NotFoundException);

      expect(tenantsRepo.update).not.toHaveBeenCalled();
    });

    it('propagates repository update errors', async () => {
      tenantsRepo.findById.mockResolvedValue(makeTenant());
      tenantsRepo.update.mockRejectedValue(new Error('Constraint violation'));

      await expect(
        service.update('tenant-1', makeUpdateDto() as any),
      ).rejects.toThrow('Constraint violation');
    });
  });

  // ─── getBookingSettings ───────────────────────────────────────────────────

  describe('getBookingSettings', () => {
    it('returns booking settings for the given tenant', async () => {
      const settings = makeBookingSettings();
      tenantsRepo.getBookingSettings.mockResolvedValue(settings);

      const result = await service.getBookingSettings('tenant-1');

      expect(result).toEqual(settings);
    });

    it('passes tenantId to the repository', async () => {
      tenantsRepo.getBookingSettings.mockResolvedValue(makeBookingSettings());

      await service.getBookingSettings('tenant-1');

      expect(tenantsRepo.getBookingSettings).toHaveBeenCalledWith('tenant-1');
      expect(tenantsRepo.getBookingSettings).toHaveBeenCalledTimes(1);
    });

    it('returns null when no settings exist', async () => {
      tenantsRepo.getBookingSettings.mockResolvedValue(null);

      const result = await service.getBookingSettings('tenant-1');

      expect(result).toBeNull();
    });

    it('propagates repository errors', async () => {
      tenantsRepo.getBookingSettings.mockRejectedValue(new Error('Settings query failed'));

      await expect(service.getBookingSettings('tenant-1')).rejects.toThrow(
        'Settings query failed',
      );
    });
  });
});
