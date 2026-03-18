import { Test, TestingModule } from '@nestjs/testing';
import { EmployeeProfileController } from './employee-profile.controller';
import { EmployeeProfileService } from './employee-profile.service';
import { CreateEmployeeProfileDto } from './dto/create-employee-profile.dto';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { EmployeeProfileQueryDto } from './dto/employee-profile-query.dto';

const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f01234567891';
const USER_ID = 'c3d4e5f6-a7b8-9012-cdef-012345678902';
const BRANCH_ID = 'd4e5f6a7-b8c9-0123-defa-123456789013';

const mockProfile = {
  id: PROFILE_ID,
  tenantId: TENANT_ID,
  userId: USER_ID,
  branchId: BRANCH_ID,
  isWorker: true,
  efficiencyCoefficient: 1,
  active: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const mockPaginatedResult = { items: [mockProfile], total: 1 };

function buildMockService(): Record<string, jest.Mock> {
  return {
    findAll: jest.fn().mockResolvedValue(mockPaginatedResult),
    findById: jest.fn().mockResolvedValue(mockProfile),
    create: jest.fn().mockResolvedValue(mockProfile),
    update: jest.fn().mockResolvedValue(mockProfile),
    delete: jest.fn().mockResolvedValue(mockProfile),
  };
}

describe('EmployeeProfileController', () => {
  let controller: EmployeeProfileController;
  let profileService: Record<string, jest.Mock>;

  beforeEach(async () => {
    profileService = buildMockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployeeProfileController],
      providers: [
        { provide: EmployeeProfileService, useValue: profileService },
      ],
    }).compile();

    controller = module.get<EmployeeProfileController>(
      EmployeeProfileController,
    );
  });

  describe('findAll', () => {
    it('delegates to profileService.findAll with tenantId and query', async () => {
      const query: EmployeeProfileQueryDto = {
        page: 1,
        limit: 20,
        sortOrder: 'asc',
        branchId: BRANCH_ID,
        active: true,
      };

      const result = await controller.findAll(TENANT_ID, query);

      expect(profileService.findAll).toHaveBeenCalledTimes(1);
      expect(profileService.findAll).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toEqual(mockPaginatedResult);
    });
  });

  describe('findOne', () => {
    it('delegates to profileService.findById with tenantId and id', async () => {
      const result = await controller.findOne(TENANT_ID, PROFILE_ID);

      expect(profileService.findById).toHaveBeenCalledTimes(1);
      expect(profileService.findById).toHaveBeenCalledWith(
        TENANT_ID,
        PROFILE_ID,
      );
      expect(result).toEqual(mockProfile);
    });
  });

  describe('create', () => {
    it('delegates to profileService.create with tenantId and dto', async () => {
      const dto: CreateEmployeeProfileDto = {
        userId: USER_ID,
        branchId: BRANCH_ID,
        isWorker: true,
        efficiencyCoefficient: 1.5,
      };

      const result = await controller.create(TENANT_ID, dto);

      expect(profileService.create).toHaveBeenCalledTimes(1);
      expect(profileService.create).toHaveBeenCalledWith(TENANT_ID, dto);
      expect(result).toEqual(mockProfile);
    });
  });

  describe('update', () => {
    it('delegates to profileService.update with tenantId, id and dto', async () => {
      const dto: UpdateEmployeeProfileDto = {
        isWorker: false,
        active: true,
        efficiencyCoefficient: 2,
      };

      const result = await controller.update(TENANT_ID, PROFILE_ID, dto);

      expect(profileService.update).toHaveBeenCalledTimes(1);
      expect(profileService.update).toHaveBeenCalledWith(
        TENANT_ID,
        PROFILE_ID,
        dto,
      );
      expect(result).toEqual(mockProfile);
    });
  });

  describe('deactivate', () => {
    it('delegates to profileService.delete with tenantId and id', async () => {
      const result = await controller.deactivate(TENANT_ID, PROFILE_ID);

      expect(profileService.delete).toHaveBeenCalledTimes(1);
      expect(profileService.delete).toHaveBeenCalledWith(TENANT_ID, PROFILE_ID);
      expect(result).toEqual(mockProfile);
    });
  });
});
