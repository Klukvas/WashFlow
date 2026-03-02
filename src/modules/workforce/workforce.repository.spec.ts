import { Test, TestingModule } from '@nestjs/testing';
import { WorkforceRepository } from './workforce.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

describe('WorkforceRepository', () => {
  let repo: WorkforceRepository;

  const tenantId = 'tenant-1';
  const branchId = 'branch-1';
  const profileId = 'profile-1';
  const userId = 'user-1';

  const mockProfile = {
    id: profileId,
    tenantId,
    userId,
    branchId,
    isWorker: true,
    active: true,
    workStartTime: '09:00',
    workEndTime: '18:00',
  };

  const tenantClient = {
    employeeProfile: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  const tenantPrisma = {
    forTenant: jest.fn().mockReturnValue(tenantClient),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantPrisma.forTenant.mockReturnValue(tenantClient);
    tenantClient.employeeProfile.findMany.mockResolvedValue([mockProfile]);
    tenantClient.employeeProfile.findFirst.mockResolvedValue(mockProfile);
    tenantClient.employeeProfile.create.mockResolvedValue(mockProfile);
    tenantClient.employeeProfile.update.mockResolvedValue(mockProfile);
    tenantClient.employeeProfile.delete.mockResolvedValue(mockProfile);
    tenantClient.employeeProfile.count.mockResolvedValue(2);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkforceRepository,
        { provide: TenantPrismaService, useValue: tenantPrisma },
      ],
    }).compile();

    repo = module.get<WorkforceRepository>(WorkforceRepository);
  });

  // ─── Profiles ────────────────────────────────────────────────────

  describe('findProfiles', () => {
    it('returns paginated profiles without filters', async () => {
      const query = { page: 1, limit: 10 } as any;
      const result = await repo.findProfiles(tenantId, query);
      expect(tenantClient.employeeProfile.findMany).toHaveBeenCalled();
      expect(tenantClient.employeeProfile.count).toHaveBeenCalled();
      expect(result).toEqual({ items: [mockProfile], total: 2 });
    });

    it('applies branchId filter when provided', async () => {
      const query = { page: 1, limit: 10, branchId } as any;
      await repo.findProfiles(tenantId, query);
      const callArgs = tenantClient.employeeProfile.findMany.mock.calls[0][0];
      expect(callArgs.where.branchId).toBe(branchId);
    });

    it('applies active filter when provided', async () => {
      const query = { page: 1, limit: 10, active: false } as any;
      await repo.findProfiles(tenantId, query);
      const callArgs = tenantClient.employeeProfile.findMany.mock.calls[0][0];
      expect(callArgs.where.active).toBe(false);
    });
  });

  describe('findProfileById', () => {
    it('finds profile by id', async () => {
      const result = await repo.findProfileById(tenantId, profileId);
      expect(tenantClient.employeeProfile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: profileId } }),
      );
      expect(result).toEqual(mockProfile);
    });
  });

  describe('findProfileByUserId', () => {
    it('finds profile by userId', async () => {
      const result = await repo.findProfileByUserId(tenantId, userId);
      expect(tenantClient.employeeProfile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId } }),
      );
      expect(result).toEqual(mockProfile);
    });
  });

  describe('createProfile', () => {
    it('creates profile with defaults for isWorker and efficiencyCoefficient', async () => {
      const data = { userId, branchId };
      await repo.createProfile(tenantId, data);
      const callArgs = tenantClient.employeeProfile.create.mock.calls[0][0];
      expect(callArgs.data.isWorker).toBe(true);
      expect(callArgs.data.efficiencyCoefficient).toBe(1);
      expect(callArgs.data.tenantId).toBe(tenantId);
    });

    it('stores workStartTime and workEndTime when provided', async () => {
      const data = { userId, branchId, workStartTime: '08:00', workEndTime: '17:00' };
      await repo.createProfile(tenantId, data);
      const callArgs = tenantClient.employeeProfile.create.mock.calls[0][0];
      expect(callArgs.data.workStartTime).toBe('08:00');
      expect(callArgs.data.workEndTime).toBe('17:00');
    });

    it('sets workStartTime and workEndTime to null when not provided', async () => {
      const data = { userId, branchId };
      await repo.createProfile(tenantId, data);
      const callArgs = tenantClient.employeeProfile.create.mock.calls[0][0];
      expect(callArgs.data.workStartTime).toBeNull();
      expect(callArgs.data.workEndTime).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('updates profile by id', async () => {
      const data = { active: false };
      await repo.updateProfile(tenantId, profileId, data);
      expect(tenantClient.employeeProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: profileId }, data }),
      );
    });
  });

  describe('deleteProfile', () => {
    it('hard-deletes profile by id', async () => {
      await repo.deleteProfile(tenantId, profileId);
      expect(tenantClient.employeeProfile.delete).toHaveBeenCalledWith({
        where: { id: profileId },
      });
    });
  });

  describe('countProfilesForBranch', () => {
    it('counts active profiles with working hours for a branch', async () => {
      await repo.countProfilesForBranch(tenantId, branchId);
      const callArgs = tenantClient.employeeProfile.count.mock.calls[0][0];
      expect(callArgs.where.branchId).toBe(branchId);
      expect(callArgs.where.active).toBe(true);
      expect(callArgs.where.workStartTime).toEqual({ not: null });
    });
  });

  describe('findAvailableEmployeesAtSlot', () => {
    const slotStart = new Date('2026-02-22T10:00:00');
    const slotEnd = new Date('2026-02-22T11:00:00');

    it('returns employee ids for available employees at slot', async () => {
      tenantClient.employeeProfile.findMany.mockResolvedValue([
        { id: 'emp-1' },
        { id: 'emp-2' },
      ]);
      const result = await repo.findAvailableEmployeesAtSlot(tenantId, branchId, slotStart, slotEnd);
      expect(result).toEqual(['emp-1', 'emp-2']);
    });

    it('queries with workStartTime/workEndTime HH:MM comparison', async () => {
      tenantClient.employeeProfile.findMany.mockResolvedValue([]);
      await repo.findAvailableEmployeesAtSlot(tenantId, branchId, slotStart, slotEnd);
      const callArgs = tenantClient.employeeProfile.findMany.mock.calls[0][0];
      expect(callArgs.where.branchId).toBe(branchId);
      expect(callArgs.where.isWorker).toBe(true);
      expect(callArgs.where.active).toBe(true);
      expect(callArgs.where.workStartTime).toBeDefined();
      expect(callArgs.where.workEndTime).toBeDefined();
      expect(callArgs.where.orders).toBeDefined();
      expect(callArgs.select).toEqual({ id: true });
    });

    it('uses lte/gte string comparison for work hours', async () => {
      tenantClient.employeeProfile.findMany.mockResolvedValue([]);
      await repo.findAvailableEmployeesAtSlot(tenantId, branchId, slotStart, slotEnd);
      const callArgs = tenantClient.employeeProfile.findMany.mock.calls[0][0];
      expect(callArgs.where.workStartTime.lte).toBeDefined();
      expect(callArgs.where.workEndTime.gte).toBeDefined();
    });

    it('returns empty array when no employees available', async () => {
      tenantClient.employeeProfile.findMany.mockResolvedValue([]);
      const result = await repo.findAvailableEmployeesAtSlot(tenantId, branchId, slotStart, slotEnd);
      expect(result).toEqual([]);
    });
  });
});
