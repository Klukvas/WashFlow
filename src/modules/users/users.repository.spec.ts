import { Test, TestingModule } from '@nestjs/testing';
import { UsersRepository } from './users.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PaginationDto } from '../../common/utils/pagination.dto';

describe('UsersRepository', () => {
  let repo: UsersRepository;

  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const branchId = 'branch-1';
  const otherBranchId = 'branch-2';
  const mockUser = { id: userId, branchId, role: {}, branch: {} };

  const tenantClient = {
    user: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  const tenantPrisma = {
    forTenant: jest.fn().mockReturnValue(tenantClient),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantPrisma.forTenant.mockReturnValue(tenantClient);
    tenantClient.user.findMany.mockResolvedValue([mockUser]);
    tenantClient.user.findFirst.mockResolvedValue(mockUser);
    tenantClient.user.create.mockResolvedValue(mockUser);
    tenantClient.user.update.mockResolvedValue(mockUser);
    tenantClient.user.count.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersRepository,
        { provide: TenantPrismaService, useValue: tenantPrisma },
      ],
    }).compile();

    repo = module.get<UsersRepository>(UsersRepository);
  });

  describe('findAll', () => {
    it('returns paginated users without branchId scope', async () => {
      const query: PaginationDto = { page: 1, limit: 10 };
      const result = await repo.findAll(tenantId, query, null);
      expect(tenantClient.user.findMany).toHaveBeenCalled();
      expect(tenantClient.user.count).toHaveBeenCalled();
      expect(result).toEqual({ items: [mockUser], total: 1 });
    });

    it('applies branchId scope when userBranchId is provided', async () => {
      const query: PaginationDto = { page: 1, limit: 10 };
      await repo.findAll(tenantId, query, branchId);
      const callArgs = tenantClient.user.findMany.mock.calls[0][0];
      expect(callArgs.where.branchId).toBe(branchId);
    });
  });

  describe('findById', () => {
    it('returns user when found with no branchId restriction', async () => {
      const result = await repo.findById(tenantId, userId, null);
      expect(result).toEqual(mockUser);
    });

    it('returns user when branchId matches userBranchId', async () => {
      const result = await repo.findById(tenantId, userId, branchId);
      expect(result).toEqual(mockUser);
    });

    it('returns null when user branchId does not match userBranchId', async () => {
      const result = await repo.findById(tenantId, userId, otherBranchId);
      expect(result).toBeNull();
    });

    it('returns null when user not found', async () => {
      tenantClient.user.findFirst.mockResolvedValue(null);
      const result = await repo.findById(tenantId, userId);
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates user and includes role and branch relations', async () => {
      const data = { email: 'test@example.com' };
      await repo.create(tenantId, data);
      expect(tenantClient.user.create).toHaveBeenCalledWith({
        data,
        include: { role: true, branch: true },
      });
    });
  });

  describe('update', () => {
    it('updates user by id and includes role and branch relations', async () => {
      const data = { firstName: 'John' } as any;
      await repo.update(tenantId, userId, data);
      expect(tenantClient.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data,
        include: { role: true, branch: true },
      });
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt on the user', async () => {
      await repo.softDelete(tenantId, userId);
      const callArgs = tenantClient.user.update.mock.calls[0][0];
      expect(callArgs.where).toEqual({ id: userId });
      expect(callArgs.data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('restore', () => {
    it('clears deletedAt and includes role and branch relations', async () => {
      await repo.restore(tenantId, userId);
      expect(tenantClient.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { deletedAt: null },
        include: { role: true, branch: true },
      });
    });
  });
});
