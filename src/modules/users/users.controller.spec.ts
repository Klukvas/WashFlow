import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PaginationDto } from '../../common/utils/pagination.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

describe('UsersController', () => {
  let controller: UsersController;
  let service: Record<string, jest.Mock>;

  const tenantId = 'tenant-uuid-1';
  const branchId = 'branch-uuid-1';
  const userId = 'user-uuid-1';

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      findById: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      softDelete: jest.fn().mockResolvedValue({}),
      restore: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersController,
        { provide: UsersService, useValue: service },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  describe('findAll', () => {
    it('should delegate to service.findAll with tenantId, query, and branchId', async () => {
      const query: PaginationDto = { page: 1, limit: 10, sortOrder: 'asc' };

      await controller.findAll(tenantId, branchId, query);

      expect(service.findAll).toHaveBeenCalledWith(tenantId, query, branchId);
    });

    it('should pass null branchId when no branch context is set', async () => {
      const query: PaginationDto = { page: 1, limit: 10, sortOrder: 'asc' };

      await controller.findAll(tenantId, null, query);

      expect(service.findAll).toHaveBeenCalledWith(tenantId, query, null);
    });
  });

  describe('findOne', () => {
    it('should delegate to service.findById with tenantId, id, and branchId', async () => {
      await controller.findOne(tenantId, branchId, userId);

      expect(service.findById).toHaveBeenCalledWith(tenantId, userId, branchId);
    });
  });

  describe('create', () => {
    it('should delegate to service.create with tenantId and dto', async () => {
      const dto: CreateUserDto = { email: 'user@example.com' } as CreateUserDto;

      await controller.create(tenantId, dto);

      expect(service.create).toHaveBeenCalledWith(tenantId, dto, null);
    });
  });

  describe('update', () => {
    it('should delegate to service.update with tenantId, id, and dto', async () => {
      const dto: UpdateUserDto = {
        email: 'updated@example.com',
      } as UpdateUserDto;

      await controller.update(tenantId, userId, dto);

      expect(service.update).toHaveBeenCalledWith(tenantId, userId, dto, null);
    });
  });

  describe('remove', () => {
    it('should delegate to service.softDelete with tenantId and id', async () => {
      await controller.remove(tenantId, userId);

      expect(service.softDelete).toHaveBeenCalledWith(tenantId, userId, null);
    });
  });

  describe('restore', () => {
    it('should delegate to service.restore with tenantId and id', async () => {
      await controller.restore(tenantId, userId);

      expect(service.restore).toHaveBeenCalledWith(tenantId, userId, null);
    });
  });

  it.each(['create', 'update', 'resetPassword', 'remove', 'restore'] as const)(
    'forwards caller branch for %s',
    async (method) => {
      service.resetPassword = jest.fn();
      const dto = { firstName: 'Scoped' };
      const args =
        method === 'create'
          ? [tenantId, dto, branchId]
          : method === 'remove' || method === 'restore'
            ? [tenantId, userId, branchId]
            : [tenantId, userId, dto, branchId];
      await Reflect.apply(controller[method], controller, args);
      const target = method === 'remove' ? 'softDelete' : method;
      expect(service[target]).toHaveBeenCalledWith(...args);
    },
  );
});
