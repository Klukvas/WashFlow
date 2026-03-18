import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EmployeeProfileService } from './employee-profile.service';
import { WorkforceRepository } from './workforce.repository';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const tenantId = 'tenant-1';
const branchId = 'branch-1';
const userId = 'user-1';
const profileId = 'profile-1';

const mockProfile = {
  id: profileId,
  tenantId,
  userId,
  branchId,
  isWorker: true,
  efficiencyCoefficient: 1,
  active: true,
  workStartTime: '09:00',
  workEndTime: '18:00',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

// ─── EmployeeProfileService ───────────────────────────────────────────────────

describe('EmployeeProfileService', () => {
  let service: EmployeeProfileService;
  let repo: Record<string, jest.Mock>;
  let prismaMock: {
    user: { findFirst: jest.Mock };
    branch: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    repo = {
      findProfiles: jest
        .fn()
        .mockResolvedValue({ items: [mockProfile], total: 1 }),
      findProfileById: jest.fn().mockResolvedValue(mockProfile),
      findProfileByUserId: jest.fn().mockResolvedValue(null),
      createProfile: jest.fn().mockResolvedValue(mockProfile),
      updateProfile: jest.fn().mockResolvedValue(mockProfile),
      deleteProfile: jest.fn().mockResolvedValue(mockProfile),
    };

    prismaMock = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: userId, tenantId }),
      },
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: branchId, tenantId }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeProfileService,
        { provide: WorkforceRepository, useValue: repo },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<EmployeeProfileService>(EmployeeProfileService);
  });

  describe('findAll', () => {
    it('should return paginated profiles', async () => {
      const query = { page: 1, limit: 10 } as any;
      const result = await service.findAll(tenantId, query);
      expect(repo.findProfiles).toHaveBeenCalledWith(tenantId, query);
      expect(result).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should return the profile when found', async () => {
      const result = await service.findById(tenantId, profileId);
      expect(result).toEqual(mockProfile);
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      repo.findProfileById.mockResolvedValue(null);
      await expect(service.findById(tenantId, profileId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw with correct message', async () => {
      repo.findProfileById.mockResolvedValue(null);
      await expect(service.findById(tenantId, profileId)).rejects.toThrow(
        'Employee profile not found',
      );
    });
  });

  describe('create', () => {
    const createDto = {
      userId,
      branchId,
      workStartTime: '09:00',
      workEndTime: '18:00',
    };

    it('should create and return the profile when no duplicate exists', async () => {
      const result = await service.create(tenantId, createDto as any);
      expect(repo.findProfileByUserId).toHaveBeenCalledWith(tenantId, userId);
      expect(repo.createProfile).toHaveBeenCalledWith(tenantId, {
        userId,
        branchId,
        isWorker: undefined,
        efficiencyCoefficient: undefined,
        workStartTime: '09:00',
        workEndTime: '18:00',
      });
      expect(result).toEqual(mockProfile);
    });

    it('should throw ConflictException when userId already has a profile', async () => {
      repo.findProfileByUserId.mockResolvedValue(mockProfile);
      await expect(service.create(tenantId, createDto as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException with correct message for duplicate profile', async () => {
      repo.findProfileByUserId.mockResolvedValue(mockProfile);
      await expect(service.create(tenantId, createDto as any)).rejects.toThrow(
        'An employee profile already exists for this user',
      );
    });

    it('should not call createProfile when userId already has a profile', async () => {
      repo.findProfileByUserId.mockResolvedValue(mockProfile);
      await service.create(tenantId, createDto as any).catch(() => undefined);
      expect(repo.createProfile).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a profile after verifying it exists', async () => {
      const dto = { workStartTime: '08:00', workEndTime: '17:00' } as any;
      await service.update(tenantId, profileId, dto);
      expect(repo.findProfileById).toHaveBeenCalledWith(tenantId, profileId);
      expect(repo.updateProfile).toHaveBeenCalledWith(tenantId, profileId, dto);
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      repo.findProfileById.mockResolvedValue(null);
      await expect(service.update(tenantId, profileId, {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deactivate', () => {
    it('should set active=false on the profile', async () => {
      await service.deactivate(tenantId, profileId);
      expect(repo.updateProfile).toHaveBeenCalledWith(tenantId, profileId, {
        active: false,
      });
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      repo.findProfileById.mockResolvedValue(null);
      await expect(service.deactivate(tenantId, profileId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('should delete an inactive profile', async () => {
      repo.findProfileById.mockResolvedValue({ ...mockProfile, active: false });
      await service.delete(tenantId, profileId);
      expect(repo.deleteProfile).toHaveBeenCalledWith(tenantId, profileId);
    });

    it('should throw BadRequestException when profile is still active', async () => {
      repo.findProfileById.mockResolvedValue({ ...mockProfile, active: true });
      await expect(service.delete(tenantId, profileId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw with correct message for active profile', async () => {
      repo.findProfileById.mockResolvedValue({ ...mockProfile, active: true });
      await expect(service.delete(tenantId, profileId)).rejects.toThrow(
        'Deactivate the employee profile before deleting',
      );
    });

    it('should not call deleteProfile when profile is active', async () => {
      repo.findProfileById.mockResolvedValue({ ...mockProfile, active: true });
      await service.delete(tenantId, profileId).catch(() => undefined);
      expect(repo.deleteProfile).not.toHaveBeenCalled();
    });
  });
});
