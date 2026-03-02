import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from '../../common/utils/pagination.dto';

jest.mock('argon2');

const mockedArgon2 = argon2 as jest.Mocked<typeof argon2>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-001';
const USER_ID = 'user-uuid-001';
const BRANCH_ID = 'branch-uuid-001';
const HASHED_PASSWORD = '$argon2id$hashed-password';

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  tenantId: TENANT_ID,
  email: 'john@example.com',
  firstName: 'John',
  lastName: 'Doe',
  phone: null,
  branchId: null,
  roleId: null,
  passwordHash: HASHED_PASSWORD,
  isActive: true,
  deletedAt: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  role: null,
  branch: null,
  ...overrides,
});

const makePaginationDto = (overrides: Partial<PaginationDto> = {}): PaginationDto =>
  Object.assign(new PaginationDto(), { page: 1, limit: 20, sortOrder: 'asc' }, overrides);

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

const makeRepoMock = () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByIdIncludeDeleted: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('UsersService', () => {
  let service: UsersService;
  let repo: ReturnType<typeof makeRepoMock>;

  beforeEach(async () => {
    repo = makeRepoMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);

    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Sanity
  // -------------------------------------------------------------------------

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // findAll
  // =========================================================================

  describe('findAll', () => {
    it('returns a paginated response with items and metadata', async () => {
      const user = makeUser();
      const query = makePaginationDto({ page: 1, limit: 10 });
      repo.findAll.mockResolvedValue({ items: [user], total: 1 });

      const result = await service.findAll(TENANT_ID, query);

      expect(result).toEqual({
        items: [user],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('returns empty items array with correct metadata when no users exist', async () => {
      const query = makePaginationDto({ page: 2, limit: 5 });
      repo.findAll.mockResolvedValue({ items: [], total: 0 });

      const result = await service.findAll(TENANT_ID, query);

      expect(result).toEqual({
        items: [],
        total: 0,
        page: 2,
        limit: 5,
        totalPages: 0,
      });
    });

    it('calculates totalPages correctly for multi-page result sets', async () => {
      const query = makePaginationDto({ page: 1, limit: 5 });
      repo.findAll.mockResolvedValue({ items: [], total: 13 });

      const result = await service.findAll(TENANT_ID, query);

      expect(result.totalPages).toBe(3);
    });

    it('passes tenantId and query to the repository', async () => {
      const query = makePaginationDto();
      repo.findAll.mockResolvedValue({ items: [], total: 0 });

      await service.findAll(TENANT_ID, query);

      expect(repo.findAll).toHaveBeenCalledWith(TENANT_ID, query, null);
    });

    it('passes branchId to the repository when provided', async () => {
      const query = makePaginationDto();
      repo.findAll.mockResolvedValue({ items: [], total: 0 });

      await service.findAll(TENANT_ID, query, BRANCH_ID);

      expect(repo.findAll).toHaveBeenCalledWith(TENANT_ID, query, BRANCH_ID);
    });

    it('defaults branchId to null when not provided', async () => {
      const query = makePaginationDto();
      repo.findAll.mockResolvedValue({ items: [], total: 0 });

      await service.findAll(TENANT_ID, query);

      expect(repo.findAll).toHaveBeenCalledWith(TENANT_ID, query, null);
    });
  });

  // =========================================================================
  // findById
  // =========================================================================

  describe('findById', () => {
    it('returns the user when found', async () => {
      const user = makeUser();
      repo.findById.mockResolvedValue(user);

      const result = await service.findById(TENANT_ID, USER_ID);

      expect(result).toEqual(user);
    });

    it('throws NotFoundException when user does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findById(TENANT_ID, USER_ID)).rejects.toThrow(
        new NotFoundException('User not found'),
      );
    });

    it('passes tenantId, id, and default null branchId to the repository', async () => {
      const user = makeUser();
      repo.findById.mockResolvedValue(user);

      await service.findById(TENANT_ID, USER_ID);

      expect(repo.findById).toHaveBeenCalledWith(TENANT_ID, USER_ID, null);
    });

    it('passes branchId to the repository when provided', async () => {
      const user = makeUser({ branchId: BRANCH_ID });
      repo.findById.mockResolvedValue(user);

      await service.findById(TENANT_ID, USER_ID, BRANCH_ID);

      expect(repo.findById).toHaveBeenCalledWith(TENANT_ID, USER_ID, BRANCH_ID);
    });

    it('throws NotFoundException when user is outside the requested branch', async () => {
      // Repository returns null when branch scope filters the user out
      repo.findById.mockResolvedValue(null);

      await expect(service.findById(TENANT_ID, USER_ID, BRANCH_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe('create', () => {
    it('hashes the plain-text password with argon2 before persisting', async () => {
      mockedArgon2.hash.mockResolvedValue(HASHED_PASSWORD);
      const dto: CreateUserDto = {
        email: 'jane@example.com',
        password: 'plaintext123',
        firstName: 'Jane',
        lastName: 'Smith',
      };
      const created = makeUser({ email: dto.email, firstName: dto.firstName, lastName: dto.lastName });
      repo.create.mockResolvedValue(created);

      await service.create(TENANT_ID, dto);

      expect(mockedArgon2.hash).toHaveBeenCalledWith('plaintext123');
    });

    it('stores passwordHash and omits the plain-text password field', async () => {
      mockedArgon2.hash.mockResolvedValue(HASHED_PASSWORD);
      const dto: CreateUserDto = {
        email: 'jane@example.com',
        password: 'plaintext123',
        firstName: 'Jane',
        lastName: 'Smith',
      };
      const created = makeUser();
      repo.create.mockResolvedValue(created);

      await service.create(TENANT_ID, dto);

      const [, payload] = repo.create.mock.calls[0];
      expect(payload).toHaveProperty('passwordHash', HASHED_PASSWORD);
      expect(payload).not.toHaveProperty('password');
    });

    it('returns the created user record from the repository', async () => {
      mockedArgon2.hash.mockResolvedValue(HASHED_PASSWORD);
      const created = makeUser();
      repo.create.mockResolvedValue(created);
      const dto: CreateUserDto = {
        email: 'jane@example.com',
        password: 'plaintext123',
        firstName: 'Jane',
        lastName: 'Smith',
      };

      const result = await service.create(TENANT_ID, dto);

      expect(result).toEqual(created);
    });

    it('forwards optional fields (phone, branchId, roleId) to the repository', async () => {
      mockedArgon2.hash.mockResolvedValue(HASHED_PASSWORD);
      const dto: CreateUserDto = {
        email: 'jane@example.com',
        password: 'plaintext123',
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '+1234567890',
        branchId: BRANCH_ID,
        roleId: 'role-uuid-001',
      };
      repo.create.mockResolvedValue(makeUser());

      await service.create(TENANT_ID, dto);

      const [, payload] = repo.create.mock.calls[0];
      expect(payload).toMatchObject({
        phone: '+1234567890',
        branchId: BRANCH_ID,
        roleId: 'role-uuid-001',
      });
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe('update', () => {
    it('updates non-password fields without touching argon2', async () => {
      const existing = makeUser();
      repo.findById.mockResolvedValue(existing);
      const updated = makeUser({ firstName: 'Updated' });
      repo.update.mockResolvedValue(updated);
      const dto: UpdateUserDto = { firstName: 'Updated' };

      const result = await service.update(TENANT_ID, USER_ID, dto);

      expect(mockedArgon2.hash).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        expect.objectContaining({ firstName: 'Updated' }),
      );
      expect(result).toEqual(updated);
    });

    it('hashes the new password when password field is present in dto', async () => {
      const existing = makeUser();
      repo.findById.mockResolvedValue(existing);
      mockedArgon2.hash.mockResolvedValue('$argon2id$new-hash');
      const updated = makeUser({ passwordHash: '$argon2id$new-hash' });
      repo.update.mockResolvedValue(updated);
      const dto: UpdateUserDto = { password: 'newPassword99' };

      await service.update(TENANT_ID, USER_ID, dto);

      expect(mockedArgon2.hash).toHaveBeenCalledWith('newPassword99');
      expect(repo.update).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        expect.objectContaining({ passwordHash: '$argon2id$new-hash' }),
      );
    });

    it('omits plain-text password from the repository payload when re-hashing', async () => {
      const existing = makeUser();
      repo.findById.mockResolvedValue(existing);
      mockedArgon2.hash.mockResolvedValue('$argon2id$new-hash');
      repo.update.mockResolvedValue(makeUser());
      const dto: UpdateUserDto = { password: 'newPassword99', firstName: 'Bob' };

      await service.update(TENANT_ID, USER_ID, dto);

      const [, , payload] = repo.update.mock.calls[0];
      expect(payload).not.toHaveProperty('password');
      expect(payload).toHaveProperty('passwordHash', '$argon2id$new-hash');
      expect(payload).toHaveProperty('firstName', 'Bob');
    });

    it('throws NotFoundException when the target user does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      const dto: UpdateUserDto = { firstName: 'Ghost' };

      await expect(service.update(TENANT_ID, USER_ID, dto)).rejects.toThrow(
        new NotFoundException('User not found'),
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('does not call argon2.hash when dto has no password field', async () => {
      repo.findById.mockResolvedValue(makeUser());
      repo.update.mockResolvedValue(makeUser());
      const dto: UpdateUserDto = { isActive: false };

      await service.update(TENANT_ID, USER_ID, dto);

      expect(mockedArgon2.hash).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // softDelete
  // =========================================================================

  describe('softDelete', () => {
    it('finds the user then delegates soft-delete to the repository', async () => {
      const user = makeUser();
      repo.findById.mockResolvedValue(user);
      const deletedUser = makeUser({ deletedAt: new Date() });
      repo.softDelete.mockResolvedValue(deletedUser);

      const result = await service.softDelete(TENANT_ID, USER_ID);

      expect(repo.findById).toHaveBeenCalledWith(TENANT_ID, USER_ID, null);
      expect(repo.softDelete).toHaveBeenCalledWith(TENANT_ID, USER_ID);
      expect(result).toEqual(deletedUser);
    });

    it('throws NotFoundException when user does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.softDelete(TENANT_ID, USER_ID)).rejects.toThrow(
        new NotFoundException('User not found'),
      );
      expect(repo.softDelete).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // restore
  // =========================================================================

  describe('restore', () => {
    it('restores a soft-deleted user', async () => {
      const deletedUser = makeUser({ deletedAt: new Date('2024-06-01T00:00:00Z') });
      const restoredUser = makeUser({ deletedAt: null });
      repo.findByIdIncludeDeleted.mockResolvedValue(deletedUser);
      repo.restore.mockResolvedValue(restoredUser);

      const result = await service.restore(TENANT_ID, USER_ID);

      expect(repo.findByIdIncludeDeleted).toHaveBeenCalledWith(TENANT_ID, USER_ID);
      expect(repo.restore).toHaveBeenCalledWith(TENANT_ID, USER_ID);
      expect(result).toEqual(restoredUser);
    });

    it('throws NotFoundException when the user record does not exist at all', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(null);

      await expect(service.restore(TENANT_ID, USER_ID)).rejects.toThrow(
        new NotFoundException('User not found'),
      );
      expect(repo.restore).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the user exists but is not deleted', async () => {
      const activeUser = makeUser({ deletedAt: null });
      repo.findByIdIncludeDeleted.mockResolvedValue(activeUser);

      await expect(service.restore(TENANT_ID, USER_ID)).rejects.toThrow(
        new BadRequestException('User is not deleted'),
      );
      expect(repo.restore).not.toHaveBeenCalled();
    });

    it('uses findByIdIncludeDeleted (not findById) to locate the user', async () => {
      const deletedUser = makeUser({ deletedAt: new Date() });
      repo.findByIdIncludeDeleted.mockResolvedValue(deletedUser);
      repo.restore.mockResolvedValue(makeUser());

      await service.restore(TENANT_ID, USER_ID);

      expect(repo.findByIdIncludeDeleted).toHaveBeenCalled();
      expect(repo.findById).not.toHaveBeenCalled();
    });
  });
});
