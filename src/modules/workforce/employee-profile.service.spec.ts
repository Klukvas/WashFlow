import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EmployeeProfileService } from './employee-profile.service';
import { WorkforceRepository } from './workforce.repository';
import { PrismaService } from '../../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROFILE_ID = 'profile-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'user-cccccccc-cccc-cccc-cccc-cccccccccccc';
const BRANCH_ID = 'branch-dddddddd-dddd-dddd-dddd-dddddddddddd';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const buildProfile = (overrides: Record<string, unknown> = {}) => ({
  id: PROFILE_ID,
  tenantId: TENANT_ID,
  userId: USER_ID,
  branchId: BRANCH_ID,
  isWorker: true,
  active: true,
  efficiencyCoefficient: 1,
  workStartTime: '09:00',
  workEndTime: '18:00',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  user: {
    id: USER_ID,
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
  },
  branch: { id: BRANCH_ID, name: 'Main' },
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function buildRepoMock() {
  return {
    findProfiles: jest.fn(),
    findProfileById: jest.fn(),
    findProfileByUserId: jest.fn(),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
    deleteProfile: jest.fn(),
    countProfilesForBranch: jest.fn(),
    findAvailableEmployeesAtSlot: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('EmployeeProfileService', () => {
  let service: EmployeeProfileService;
  let repo: ReturnType<typeof buildRepoMock>;
  let prismaMock: {
    user: { findFirst: jest.Mock };
    branch: { findFirst: jest.Mock };
    order: { count: jest.Mock };
  };

  beforeEach(async () => {
    repo = buildRepoMock();

    prismaMock = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID }),
      },
      branch: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: BRANCH_ID, tenantId: TENANT_ID }),
      },
      order: {
        count: jest.fn().mockResolvedValue(0),
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------

  describe('findAll()', () => {
    it('delegates to workforceRepo.findProfiles', async () => {
      const profiles = [buildProfile()];
      repo.findProfiles.mockResolvedValue({ items: profiles, total: 1 });

      const query = { page: 1, limit: 10 };
      await service.findAll(TENANT_ID, query as any);

      expect(repo.findProfiles).toHaveBeenCalledWith(TENANT_ID, query);
    });

    it('returns paginated response with items', async () => {
      const profiles = [buildProfile()];
      repo.findProfiles.mockResolvedValue({ items: profiles, total: 1 });

      const query = { page: 1, limit: 10 };
      const result = await service.findAll(TENANT_ID, query as any);

      expect(result).toHaveProperty('items');
      expect(result.items).toEqual(profiles);
    });

    it('returns paginated metadata with total', async () => {
      repo.findProfiles.mockResolvedValue({ items: [], total: 0 });

      const query = { page: 1, limit: 10 };
      const result = await service.findAll(TENANT_ID, query as any);

      expect(result).toHaveProperty('total', 0);
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe('findById()', () => {
    it('returns profile when found', async () => {
      const profile = buildProfile();
      repo.findProfileById.mockResolvedValue(profile);

      const result = await service.findById(TENANT_ID, PROFILE_ID);

      expect(result).toEqual(profile);
      expect(repo.findProfileById).toHaveBeenCalledWith(TENANT_ID, PROFILE_ID);
    });

    it('throws NotFoundException when not found', async () => {
      repo.findProfileById.mockResolvedValue(null);

      await expect(service.findById(TENANT_ID, PROFILE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException with correct message', async () => {
      repo.findProfileById.mockResolvedValue(null);

      await expect(service.findById(TENANT_ID, PROFILE_ID)).rejects.toThrow(
        /Employee profile not found/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create()', () => {
    const createDto = {
      userId: USER_ID,
      branchId: BRANCH_ID,
      isWorker: true,
      efficiencyCoefficient: 1.5,
      workStartTime: '09:00',
      workEndTime: '18:00',
    };

    it('throws ConflictException when profile already exists for user', async () => {
      repo.findProfileByUserId.mockResolvedValue(buildProfile());

      await expect(service.create(TENANT_ID, createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException with correct message', async () => {
      repo.findProfileByUserId.mockResolvedValue(buildProfile());

      await expect(service.create(TENANT_ID, createDto)).rejects.toThrow(
        /An employee profile already exists for this user/,
      );
    });

    it('delegates to workforceRepo.createProfile when no existing profile', async () => {
      const newProfile = buildProfile();
      repo.findProfileByUserId.mockResolvedValue(null);
      repo.createProfile.mockResolvedValue(newProfile);

      await service.create(TENANT_ID, createDto);

      expect(repo.createProfile).toHaveBeenCalledWith(TENANT_ID, {
        userId: USER_ID,
        branchId: BRANCH_ID,
        isWorker: true,
        efficiencyCoefficient: 1.5,
        workStartTime: '09:00',
        workEndTime: '18:00',
      });
    });

    it('returns the created profile', async () => {
      const newProfile = buildProfile();
      repo.findProfileByUserId.mockResolvedValue(null);
      repo.createProfile.mockResolvedValue(newProfile);

      const result = await service.create(TENANT_ID, createDto);

      expect(result).toEqual(newProfile);
    });

    it('checks for existing profile using the correct userId', async () => {
      repo.findProfileByUserId.mockResolvedValue(null);
      repo.createProfile.mockResolvedValue(buildProfile());

      await service.create(TENANT_ID, createDto);

      expect(repo.findProfileByUserId).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update()', () => {
    const updateDto = { branchId: 'new-branch-id', efficiencyCoefficient: 2 };

    it('throws NotFoundException when profile not found', async () => {
      repo.findProfileById.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, PROFILE_ID, updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('delegates to workforceRepo.updateProfile', async () => {
      const existing = buildProfile();
      const updated = buildProfile({ branchId: 'new-branch-id' });
      repo.findProfileById.mockResolvedValue(existing);
      repo.updateProfile.mockResolvedValue(updated);

      await service.update(TENANT_ID, PROFILE_ID, updateDto);

      expect(repo.updateProfile).toHaveBeenCalledWith(TENANT_ID, PROFILE_ID, {
        ...updateDto,
      });
    });

    it('returns the updated profile', async () => {
      const existing = buildProfile();
      const updated = buildProfile({ branchId: 'new-branch-id' });
      repo.findProfileById.mockResolvedValue(existing);
      repo.updateProfile.mockResolvedValue(updated);

      const result = await service.update(TENANT_ID, PROFILE_ID, updateDto);

      expect(result).toEqual(updated);
    });
  });

  // -------------------------------------------------------------------------
  // deactivate
  // -------------------------------------------------------------------------

  describe('deactivate()', () => {
    it('throws NotFoundException when not found', async () => {
      repo.findProfileById.mockResolvedValue(null);

      await expect(service.deactivate(TENANT_ID, PROFILE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sets active to false via workforceRepo.updateProfile', async () => {
      const existing = buildProfile();
      const deactivated = buildProfile({ active: false });
      repo.findProfileById.mockResolvedValue(existing);
      repo.updateProfile.mockResolvedValue(deactivated);

      await service.deactivate(TENANT_ID, PROFILE_ID);

      expect(repo.updateProfile).toHaveBeenCalledWith(TENANT_ID, PROFILE_ID, {
        active: false,
      });
    });

    it('returns the deactivated profile', async () => {
      const existing = buildProfile();
      const deactivated = buildProfile({ active: false });
      repo.findProfileById.mockResolvedValue(existing);
      repo.updateProfile.mockResolvedValue(deactivated);

      const result = await service.deactivate(TENANT_ID, PROFILE_ID);

      expect(result).toEqual(deactivated);
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  describe('delete()', () => {
    it('throws NotFoundException when not found', async () => {
      repo.findProfileById.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, PROFILE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when profile is still active', async () => {
      repo.findProfileById.mockResolvedValue(buildProfile({ active: true }));

      await expect(service.delete(TENANT_ID, PROFILE_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException with correct message when active', async () => {
      repo.findProfileById.mockResolvedValue(buildProfile({ active: true }));

      await expect(service.delete(TENANT_ID, PROFILE_ID)).rejects.toThrow(
        /Deactivate the employee profile before deleting/,
      );
    });

    it('delegates to workforceRepo.deleteProfile when inactive', async () => {
      const inactive = buildProfile({ active: false });
      repo.findProfileById.mockResolvedValue(inactive);
      repo.deleteProfile.mockResolvedValue(inactive);

      await service.delete(TENANT_ID, PROFILE_ID);

      expect(repo.deleteProfile).toHaveBeenCalledWith(TENANT_ID, PROFILE_ID);
    });

    it('returns the deleted profile', async () => {
      const inactive = buildProfile({ active: false });
      repo.findProfileById.mockResolvedValue(inactive);
      repo.deleteProfile.mockResolvedValue(inactive);

      const result = await service.delete(TENANT_ID, PROFILE_ID);

      expect(result).toEqual(inactive);
    });

    it('does not call deleteProfile when profile is active', async () => {
      repo.findProfileById.mockResolvedValue(buildProfile({ active: true }));

      await expect(service.delete(TENANT_ID, PROFILE_ID)).rejects.toThrow();

      expect(repo.deleteProfile).not.toHaveBeenCalled();
    });
  });
});
