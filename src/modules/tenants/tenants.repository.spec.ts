import { Test, TestingModule } from '@nestjs/testing';
import { TenantsRepository } from './tenants.repository';
import { PrismaService } from '../../prisma/prisma.service';

describe('TenantsRepository', () => {
  let repo: TenantsRepository;
  let prisma: Record<string, jest.Mock>;

  const mockTenant = {
    id: 'tenant-1',
    name: 'Acme',
    slug: 'acme',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findMany: jest.fn().mockResolvedValue([mockTenant]),
        findUnique: jest.fn().mockResolvedValue(mockTenant),
        create: jest.fn().mockResolvedValue(mockTenant),
        update: jest.fn().mockResolvedValue(mockTenant),
      },
      bookingSettings: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repo = module.get<TenantsRepository>(TenantsRepository);
  });

  describe('findAll', () => {
    it('returns all tenants ordered by createdAt desc', async () => {
      const result = await repo.findAll();
      expect(prisma.tenant.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([mockTenant]);
    });
  });

  describe('findById', () => {
    it('finds tenant by id', async () => {
      const result = await repo.findById('tenant-1');
      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: 'tenant-1' },
      });
      expect(result).toEqual(mockTenant);
    });
  });

  describe('findBySlug', () => {
    it('finds tenant by slug', async () => {
      const result = await repo.findBySlug('acme');
      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { slug: 'acme' },
      });
      expect(result).toEqual(mockTenant);
    });
  });

  describe('create', () => {
    it('creates a tenant with provided data', async () => {
      const data = { name: 'NewCo', slug: 'newco' } as any;
      await repo.create(data);
      expect(prisma.tenant.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('update', () => {
    it('updates a tenant by id', async () => {
      const data = { name: 'Updated' } as any;
      await repo.update('tenant-1', data);
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-1' },
        data,
      });
    });
  });

  describe('getBookingSettings', () => {
    it('finds booking settings for tenant (no branch)', async () => {
      await repo.getBookingSettings('tenant-1');
      expect(prisma.bookingSettings.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', branchId: null },
      });
    });
  });
});
