import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { ConflictException } from '@nestjs/common';
import { EmailService } from '../email/email.service';

jest.mock('argon2');

const mockedArgon2 = argon2 as jest.Mocked<typeof argon2>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const BRANCH_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ROLE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ACCESS_TOKEN = 'mock-access-token';
const REFRESH_TOKEN = 'mock-refresh-token';

const buildUser = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  tenantId: TENANT_ID,
  branchId: BRANCH_ID,
  email: 'jane@example.com',
  firstName: 'Jane',
  lastName: 'Doe',
  passwordHash: '$argon2id$hash',
  isActive: true,
  isSuperAdmin: false,
  deletedAt: null,
  tokenVersion: 0,
  failedLoginAttempts: 0,
  accountLockedUntil: null,
  roleId: ROLE_ID,
  role: {
    id: ROLE_ID,
    permissions: [
      {
        permission: { module: 'orders', action: 'read' },
      },
      {
        permission: { module: 'orders', action: 'write' },
      },
    ],
  },
  ...overrides,
});

const LOGIN_DTO: LoginDto = {
  email: 'jane@example.com',
  password: 'secret123',
};

const JWT_PAYLOAD: JwtPayload = {
  sub: USER_ID,
  tenantId: TENANT_ID,
  branchId: BRANCH_ID,
  email: 'jane@example.com',
  isSuperAdmin: false,
  permissions: ['orders.read', 'orders.write'],
  type: 'refresh',
  tokenVersion: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PrismaMock = {
  user: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  tenant: {
    findUnique: jest.Mock;
  };
  branch: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
  };
  passwordResetToken: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

type JwtMock = {
  sign: jest.Mock;
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let jwtService: JwtMock;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
      tenant: {
        findUnique: jest.fn(),
      },
      branch: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: BRANCH_ID, deletedAt: null }),
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: BRANCH_ID, deletedAt: null }),
      },
      passwordResetToken: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue(undefined),
      },
      $transaction: jest.fn(),
    };

    jwtService = {
      sign: jest
        .fn()
        .mockReturnValueOnce(ACCESS_TOKEN)
        .mockReturnValueOnce(REFRESH_TOKEN),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, string> = {
                'jwt.accessSecret': 'test-access-secret-32-chars-long!!',
                'jwt.refreshSecret': 'test-refresh-secret-32-chars-long!',
                'jwt.accessExpiration': '15m',
                'jwt.refreshExpiration': '7d',
              };
              return map[key];
            }),
          },
        },
        {
          provide: EventDispatcherService,
          useValue: { dispatch: jest.fn() },
        },
        {
          provide: EmailService,
          useValue: {
            sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
            sendAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Smoke
  // -------------------------------------------------------------------------

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // login()
  // =========================================================================

  describe('login()', () => {
    describe('success', () => {
      it('returns accessToken, refreshToken and user on valid credentials', async () => {
        const user = buildUser();
        prisma.user.findUnique.mockResolvedValue(user);
        mockedArgon2.verify.mockResolvedValue(true);

        const result = await service.login(LOGIN_DTO);

        expect(result.response.accessToken).toBe(ACCESS_TOKEN);
        expect(result.refreshToken).toBe(REFRESH_TOKEN);
        expect(result.response.user).toEqual({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          tenantId: user.tenantId,
          branchId: user.branchId,
          isSuperAdmin: user.isSuperAdmin,
        });
      });

      it('queries prisma with email via findUnique', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());
        mockedArgon2.verify.mockResolvedValue(true);

        await service.login(LOGIN_DTO);

        expect(prisma.user.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              email: LOGIN_DTO.email,
            },
          }),
        );
      });

      it('verifies password against stored hash', async () => {
        const user = buildUser();
        prisma.user.findUnique.mockResolvedValue(user);
        mockedArgon2.verify.mockResolvedValue(true);

        await service.login(LOGIN_DTO);

        expect(mockedArgon2.verify).toHaveBeenCalledWith(
          user.passwordHash,
          LOGIN_DTO.password,
        );
      });

      it('signs access token with access secret and expiration', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());
        mockedArgon2.verify.mockResolvedValue(true);

        await service.login(LOGIN_DTO);

        const firstCall = jwtService.sign.mock.calls[0];
        expect(firstCall[0]).toMatchObject({ type: 'access' });
        expect(firstCall[1]).toMatchObject({
          secret: 'test-access-secret-32-chars-long!!',
          expiresIn: '15m',
        });
      });

      it('signs refresh token with refresh secret and expiration', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());
        mockedArgon2.verify.mockResolvedValue(true);

        await service.login(LOGIN_DTO);

        const secondCall = jwtService.sign.mock.calls[1];
        expect(secondCall[0]).toMatchObject({ type: 'refresh' });
        expect(secondCall[1]).toMatchObject({
          secret: 'test-refresh-secret-32-chars-long!',
          expiresIn: '7d',
        });
      });

      it('sets branchId to null in token payload when user has no branch', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser({ branchId: null }));
        mockedArgon2.verify.mockResolvedValue(true);

        await service.login(LOGIN_DTO);

        const firstCallPayload = jwtService.sign.mock.calls[0][0];
        expect(firstCallPayload.branchId).toBeNull();
      });
    });

    // -----------------------------------------------------------------------
    // Permissions
    // -----------------------------------------------------------------------

    describe('permissions', () => {
      it('builds permissions from role.permissions junction as "module.action" strings', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());
        mockedArgon2.verify.mockResolvedValue(true);

        await service.login(LOGIN_DTO);

        const payload = jwtService.sign.mock.calls[0][0];
        expect(payload.permissions).toEqual(['orders.read', 'orders.write']);
      });

      it('defaults permissions to empty array when user has no role', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser({ role: null }));
        mockedArgon2.verify.mockResolvedValue(true);

        await service.login(LOGIN_DTO);

        const payload = jwtService.sign.mock.calls[0][0];
        expect(payload.permissions).toEqual([]);
      });

      it('defaults permissions to empty array when role has no permissions', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ role: { id: ROLE_ID, permissions: [] } }),
        );
        mockedArgon2.verify.mockResolvedValue(true);

        await service.login(LOGIN_DTO);

        const payload = jwtService.sign.mock.calls[0][0];
        expect(payload.permissions).toEqual([]);
      });
    });

    // -----------------------------------------------------------------------
    // Failure paths
    // -----------------------------------------------------------------------

    describe('failures', () => {
      it('throws UnauthorizedException when user is not found', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        await expect(service.login(LOGIN_DTO)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('throws UnauthorizedException with "Invalid credentials" when user not found', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        await expect(service.login(LOGIN_DTO)).rejects.toThrow(
          'Invalid credentials',
        );
      });

      it('throws UnauthorizedException when user is inactive', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ isActive: false }),
        );

        await expect(service.login(LOGIN_DTO)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('calls argon2.verify with dummy hash when user is inactive (constant-time)', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ isActive: false }),
        );
        mockedArgon2.verify.mockResolvedValue(false);

        await expect(service.login(LOGIN_DTO)).rejects.toThrow(
          UnauthorizedException,
        );
        expect(mockedArgon2.verify).toHaveBeenCalledTimes(1);
        expect(mockedArgon2.verify).toHaveBeenCalledWith(
          expect.stringContaining('$argon2id$'),
          LOGIN_DTO.password,
        );
      });

      it('throws UnauthorizedException when user is soft-deleted', async () => {
        // Soft-deleted users are returned by findUnique but rejected by the
        // deletedAt check in the service — same code path as inactive user.
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ deletedAt: new Date() }),
        );

        await expect(service.login(LOGIN_DTO)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('throws UnauthorizedException when user record has deletedAt set but slips through query', async () => {
        // Guard: even if a record somehow arrives with deletedAt set, the service rejects it.
        // The service still calls argon2.verify with a dummy hash for constant-time protection.
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ deletedAt: new Date() }),
        );
        mockedArgon2.verify.mockResolvedValue(false);

        await expect(service.login(LOGIN_DTO)).rejects.toThrow(
          UnauthorizedException,
        );
        expect(mockedArgon2.verify).toHaveBeenCalledTimes(1);
        expect(mockedArgon2.verify).toHaveBeenCalledWith(
          expect.stringContaining('$argon2id$'),
          LOGIN_DTO.password,
        );
      });

      it('throws UnauthorizedException when password is wrong', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());
        mockedArgon2.verify.mockResolvedValue(false);

        await expect(service.login(LOGIN_DTO)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('throws UnauthorizedException with "Invalid credentials" when password is wrong', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());
        mockedArgon2.verify.mockResolvedValue(false);

        await expect(service.login(LOGIN_DTO)).rejects.toThrow(
          'Invalid credentials',
        );
      });

      it('propagates unexpected errors from prisma', async () => {
        prisma.user.findUnique.mockRejectedValue(
          new Error('Database connection lost'),
        );

        await expect(service.login(LOGIN_DTO)).rejects.toThrow(
          'Database connection lost',
        );
      });

      it('propagates unexpected errors from argon2.verify', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());
        mockedArgon2.verify.mockRejectedValue(
          new Error('argon2 internal error'),
        );

        await expect(service.login(LOGIN_DTO)).rejects.toThrow(
          'argon2 internal error',
        );
      });
    });

    // -----------------------------------------------------------------------
    // Account lockout
    // -----------------------------------------------------------------------

    describe('account lockout', () => {
      it('throws UnauthorizedException when account is locked', async () => {
        const futureDate = new Date(Date.now() + 30 * 60 * 1000);
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ accountLockedUntil: futureDate }),
        );

        await expect(service.login(LOGIN_DTO)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('throws with lock message when account is locked', async () => {
        const futureDate = new Date(Date.now() + 30 * 60 * 1000);
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ accountLockedUntil: futureDate }),
        );

        await expect(service.login(LOGIN_DTO)).rejects.toThrow(
          'Account is temporarily locked',
        );
      });

      it('increments failedLoginAttempts on wrong password', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ failedLoginAttempts: 2 }),
        );
        mockedArgon2.verify.mockResolvedValue(false);

        await service.login(LOGIN_DTO).catch(() => undefined);

        expect(prisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ failedLoginAttempts: 3 }),
          }),
        );
      });

      it('locks account after 5 failed attempts', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ failedLoginAttempts: 4 }),
        );
        mockedArgon2.verify.mockResolvedValue(false);

        await service.login(LOGIN_DTO).catch(() => undefined);

        expect(prisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              failedLoginAttempts: 5,
              accountLockedUntil: expect.any(Date),
            }),
          }),
        );
      });

      it('resets failedLoginAttempts on successful login', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ failedLoginAttempts: 3 }),
        );
        mockedArgon2.verify.mockResolvedValue(true);

        await service.login(LOGIN_DTO);

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: USER_ID },
          data: { failedLoginAttempts: 0, accountLockedUntil: null },
        });
      });

      it('allows login after lock expires', async () => {
        const pastDate = new Date(Date.now() - 1000);
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ accountLockedUntil: pastDate, failedLoginAttempts: 5 }),
        );
        mockedArgon2.verify.mockResolvedValue(true);

        const result = await service.login(LOGIN_DTO);

        expect(result.response.accessToken).toBe(ACCESS_TOKEN);
      });
    });
  });

  // =========================================================================
  // refreshTokens()
  // =========================================================================

  describe('refreshTokens()', () => {
    describe('success', () => {
      it('returns new accessToken and refreshToken for an active user', async () => {
        const user = buildUser();
        prisma.user.findUnique.mockResolvedValue(user);

        const result = await service.refreshTokens(JWT_PAYLOAD);

        expect(result.response.accessToken).toBe(ACCESS_TOKEN);
        expect(result.refreshToken).toBe(REFRESH_TOKEN);
      });

      it('returns the full user object in the response', async () => {
        const user = buildUser();
        prisma.user.findUnique.mockResolvedValue(user);

        const result = await service.refreshTokens(JWT_PAYLOAD);

        expect(result.response.user).toEqual({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          tenantId: user.tenantId,
          branchId: user.branchId,
          isSuperAdmin: user.isSuperAdmin,
        });
      });

      it('looks up user by payload.sub', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());

        await service.refreshTokens(JWT_PAYLOAD);

        expect(prisma.user.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: JWT_PAYLOAD.sub },
          }),
        );
      });

      it('includes role and permissions in the prisma query', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());

        await service.refreshTokens(JWT_PAYLOAD);

        expect(prisma.user.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({
            include: {
              role: {
                include: {
                  permissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          }),
        );
      });

      it('rebuilds permissions from the refreshed user record', async () => {
        const user = buildUser({
          role: {
            id: ROLE_ID,
            permissions: [
              { permission: { module: 'invoices', action: 'delete' } },
            ],
          },
        });
        prisma.user.findUnique.mockResolvedValue(user);

        await service.refreshTokens(JWT_PAYLOAD);

        const payload = jwtService.sign.mock.calls[0][0];
        expect(payload.permissions).toEqual(['invoices.delete']);
      });

      it('defaults permissions to [] when refreshed user has no role', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser({ role: null }));

        await service.refreshTokens(JWT_PAYLOAD);

        const payload = jwtService.sign.mock.calls[0][0];
        expect(payload.permissions).toEqual([]);
      });
    });

    // -----------------------------------------------------------------------
    // Failure paths
    // -----------------------------------------------------------------------

    describe('failures', () => {
      it('throws UnauthorizedException when user is not found', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        await expect(service.refreshTokens(JWT_PAYLOAD)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('throws UnauthorizedException with "User no longer active" when user not found', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        await expect(service.refreshTokens(JWT_PAYLOAD)).rejects.toThrow(
          'User no longer active',
        );
      });

      it('throws UnauthorizedException when user is inactive', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ isActive: false }),
        );

        await expect(service.refreshTokens(JWT_PAYLOAD)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('throws UnauthorizedException with "User no longer active" when user is inactive', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ isActive: false }),
        );

        await expect(service.refreshTokens(JWT_PAYLOAD)).rejects.toThrow(
          'User no longer active',
        );
      });

      it('throws UnauthorizedException when user has been soft-deleted after token issuance', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ deletedAt: new Date() }),
        );

        await expect(service.refreshTokens(JWT_PAYLOAD)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('throws UnauthorizedException with "User no longer active" when user is soft-deleted', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ deletedAt: new Date() }),
        );

        await expect(service.refreshTokens(JWT_PAYLOAD)).rejects.toThrow(
          'User no longer active',
        );
      });

      it('propagates unexpected errors from prisma', async () => {
        prisma.user.findUnique.mockRejectedValue(
          new Error('Database connection lost'),
        );

        await expect(service.refreshTokens(JWT_PAYLOAD)).rejects.toThrow(
          'Database connection lost',
        );
      });
    });
  });

  // =========================================================================
  // changePassword()
  // =========================================================================

  describe('changePassword()', () => {
    const CHANGE_DTO = {
      currentPassword: 'oldPass123',
      newPassword: 'newPass456',
    };

    describe('success', () => {
      it('verifies current password and hashes the new one', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());
        // First verify call: current password is correct (true)
        // Second verify call: new password is different from current (false)
        mockedArgon2.verify
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false);
        mockedArgon2.hash.mockResolvedValue('$argon2id$new-hash');

        await service.changePassword(USER_ID, CHANGE_DTO);

        expect(mockedArgon2.verify).toHaveBeenCalledWith(
          '$argon2id$hash',
          'oldPass123',
        );
        expect(mockedArgon2.hash).toHaveBeenCalledWith('newPass456');
      });

      it('updates user with new password hash', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());
        mockedArgon2.verify
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false);
        mockedArgon2.hash.mockResolvedValue('$argon2id$new-hash');

        await service.changePassword(USER_ID, CHANGE_DTO);

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: USER_ID },
          data: {
            passwordHash: '$argon2id$new-hash',
            tokenVersion: { increment: 1 },
          },
        });
      });

      it('looks up user by userId', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());
        mockedArgon2.verify
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false);
        mockedArgon2.hash.mockResolvedValue('$argon2id$new-hash');

        await service.changePassword(USER_ID, CHANGE_DTO);

        expect(prisma.user.findUnique).toHaveBeenCalledWith({
          where: { id: USER_ID },
        });
      });
    });

    describe('failures', () => {
      it('throws UnauthorizedException when user is not found', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        await expect(
          service.changePassword(USER_ID, CHANGE_DTO),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('throws with "User not found or inactive" when user not found', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        await expect(
          service.changePassword(USER_ID, CHANGE_DTO),
        ).rejects.toThrow('User not found or inactive');
      });

      it('throws UnauthorizedException when user is inactive', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ isActive: false }),
        );

        await expect(
          service.changePassword(USER_ID, CHANGE_DTO),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('throws UnauthorizedException when user is soft-deleted', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ deletedAt: new Date() }),
        );

        await expect(
          service.changePassword(USER_ID, CHANGE_DTO),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('does not call argon2.verify when user is inactive', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ isActive: false }),
        );

        await expect(
          service.changePassword(USER_ID, CHANGE_DTO),
        ).rejects.toThrow(UnauthorizedException);
        expect(mockedArgon2.verify).not.toHaveBeenCalled();
      });

      it('throws BadRequestException when current password is incorrect', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());
        mockedArgon2.verify.mockResolvedValue(false);

        await expect(
          service.changePassword(USER_ID, CHANGE_DTO),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws with "Current password is incorrect" message', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());
        mockedArgon2.verify.mockResolvedValue(false);

        await expect(
          service.changePassword(USER_ID, CHANGE_DTO),
        ).rejects.toThrow('Current password is incorrect');
      });

      it('does not call argon2.hash when current password is wrong', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());
        mockedArgon2.verify.mockResolvedValue(false);

        await expect(
          service.changePassword(USER_ID, CHANGE_DTO),
        ).rejects.toThrow(BadRequestException);
        expect(mockedArgon2.hash).not.toHaveBeenCalled();
      });

      it('does not call prisma.user.update when current password is wrong', async () => {
        prisma.user.findUnique.mockResolvedValue(buildUser());
        mockedArgon2.verify.mockResolvedValue(false);

        await expect(
          service.changePassword(USER_ID, CHANGE_DTO),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.user.update).not.toHaveBeenCalled();
      });
    });
  });

  // =========================================================================
  // register()
  // =========================================================================

  describe('register()', () => {
    const REGISTER_DTO: RegisterDto = {
      email: 'new@example.com',
      password: 'newPass123',
      firstName: 'New',
      lastName: 'User',
      companyName: 'Acme Corp',
    };

    const PERMISSION_ID = 'perm-1';
    const NEW_TENANT_ID = 'new-tenant-id';
    const NEW_ROLE_ID = 'new-role-id';

    const buildTransactionResult = (
      overrides: Record<string, unknown> = {},
    ) => ({
      user: {
        id: USER_ID,
        tenantId: NEW_TENANT_ID,
        branchId: null,
        email: REGISTER_DTO.email,
        firstName: REGISTER_DTO.firstName,
        lastName: REGISTER_DTO.lastName,
        isSuperAdmin: false,
        tokenVersion: 0,
        ...overrides,
      },
      permissions: ['orders.read'],
    });

    beforeEach(() => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.tenant.findUnique.mockResolvedValue(null);
      mockedArgon2.hash.mockResolvedValue('$argon2id$hashed');
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            tenant: {
              create: jest.fn().mockResolvedValue({ id: NEW_TENANT_ID }),
              findUnique: prisma.tenant.findUnique,
            },
            subscription: {
              create: jest.fn().mockResolvedValue({}),
            },
            permission: {
              findMany: jest
                .fn()
                .mockResolvedValue([
                  { id: PERMISSION_ID, module: 'orders', action: 'read' },
                ]),
            },
            role: {
              create: jest.fn().mockResolvedValue({
                id: NEW_ROLE_ID,
                permissions: [
                  { permission: { module: 'orders', action: 'read' } },
                ],
              }),
            },
            user: {
              create: jest
                .fn()
                .mockResolvedValue(buildTransactionResult().user),
            },
          };
          return fn(tx);
        },
      );
    });

    describe('success', () => {
      it('returns accessToken and refreshToken on successful registration', async () => {
        const result = await service.register(REGISTER_DTO);

        expect(result.response.accessToken).toBe(ACCESS_TOKEN);
        expect(result.refreshToken).toBe(REFRESH_TOKEN);
      });

      it('returns user data in the response', async () => {
        const result = await service.register(REGISTER_DTO);

        expect(result.response.user).toEqual(
          expect.objectContaining({
            email: REGISTER_DTO.email,
            firstName: REGISTER_DTO.firstName,
            lastName: REGISTER_DTO.lastName,
          }),
        );
      });

      it('checks for existing email before creating', async () => {
        await service.register(REGISTER_DTO);

        expect(prisma.user.findFirst).toHaveBeenCalledWith({
          where: { email: REGISTER_DTO.email },
        });
      });

      it('hashes the password with argon2', async () => {
        await service.register(REGISTER_DTO);

        expect(mockedArgon2.hash).toHaveBeenCalledWith(REGISTER_DTO.password);
      });

      it('creates tenant, subscription, role, and user in a transaction', async () => {
        await service.register(REGISTER_DTO);

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      });

      it('builds permissions from the admin role', async () => {
        await service.register(REGISTER_DTO);

        const payload = jwtService.sign.mock.calls[0][0];
        expect(payload.permissions).toEqual(['orders.read']);
      });
    });

    describe('slug generation', () => {
      it('generates slug from company name', async () => {
        await service.register(REGISTER_DTO);

        // The slug check queries tenant.findUnique
        expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
          where: { slug: 'acme-corp' },
        });
      });

      it('handles special characters in company name', async () => {
        await service.register({
          ...REGISTER_DTO,
          companyName: 'My Company!@#',
        });

        expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
          where: { slug: 'my-company' },
        });
      });

      it('appends suffix when slug is taken', async () => {
        prisma.tenant.findUnique.mockResolvedValue({ id: 'existing' });

        await service.register(REGISTER_DTO);

        // It should still complete successfully with a suffixed slug
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      });

      it('defaults slug to "company" when name produces empty string', async () => {
        await service.register({ ...REGISTER_DTO, companyName: '!!!@@@' });

        expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
          where: { slug: 'company' },
        });
      });
    });

    describe('failures', () => {
      it('throws ConflictException when email already exists', async () => {
        prisma.user.findFirst.mockResolvedValue(buildUser());

        await expect(service.register(REGISTER_DTO)).rejects.toThrow(
          ConflictException,
        );
      });

      it('throws with "Email already in use" message', async () => {
        prisma.user.findFirst.mockResolvedValue(buildUser());

        await expect(service.register(REGISTER_DTO)).rejects.toThrow(
          'Email already in use',
        );
      });

      it('does not call $transaction when email exists', async () => {
        prisma.user.findFirst.mockResolvedValue(buildUser());

        await service.register(REGISTER_DTO).catch(() => undefined);
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('propagates unexpected errors from prisma', async () => {
        prisma.user.findFirst.mockRejectedValue(
          new Error('Database connection lost'),
        );

        await expect(service.register(REGISTER_DTO)).rejects.toThrow(
          'Database connection lost',
        );
      });
    });
  });

  // =========================================================================
  // logout()
  // =========================================================================

  describe('logout()', () => {
    it('increments tokenVersion for the user', async () => {
      await service.logout(USER_ID, TENANT_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { tokenVersion: { increment: 1 } },
      });
    });

    it('calls prisma.user.update exactly once', async () => {
      await service.logout(USER_ID, TENANT_ID);

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('propagates errors from prisma', async () => {
      prisma.user.update.mockRejectedValue(new Error('DB error'));

      await expect(service.logout(USER_ID, TENANT_ID)).rejects.toThrow(
        'DB error',
      );
    });
  });

  // =========================================================================
  // refreshTokens() – token version mismatch
  // =========================================================================

  describe('refreshTokens() – token version', () => {
    it('throws UnauthorizedException when tokenVersion does not match', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ tokenVersion: 5 }));

      const payload = { ...JWT_PAYLOAD, tokenVersion: 0 };
      await expect(service.refreshTokens(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws with "Token has been revoked" when tokenVersion mismatches', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ tokenVersion: 3 }));

      const payload = { ...JWT_PAYLOAD, tokenVersion: 1 };
      await expect(service.refreshTokens(payload)).rejects.toThrow(
        'Token has been revoked',
      );
    });

    it('does not sign tokens when tokenVersion is invalid', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ tokenVersion: 2 }));

      const payload = { ...JWT_PAYLOAD, tokenVersion: 0 };
      await service.refreshTokens(payload).catch(() => undefined);

      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // login() & refreshTokens() – deleted role / permission changes
  // =========================================================================

  describe('login() – deleted role', () => {
    it('succeeds with empty permissions when user role is soft-deleted (role: null in query result)', async () => {
      // When a role is soft-deleted, the include query returns role: null
      // because TenantPrismaService filters out deleted records.
      prisma.user.findUnique.mockResolvedValue(buildUser({ role: null }));
      mockedArgon2.verify.mockResolvedValue(true);

      const result = await service.login(LOGIN_DTO);

      expect(result.response.accessToken).toBe(ACCESS_TOKEN);
      const payload = jwtService.sign.mock.calls[0][0];
      expect(payload.permissions).toEqual([]);
    });
  });

  describe('refreshTokens() – role/permission changes', () => {
    it('returns empty permissions when role was soft-deleted after login', async () => {
      // User still active, but role gone (soft-deleted between login and refresh)
      prisma.user.findUnique.mockResolvedValue(buildUser({ role: null }));

      const result = await service.refreshTokens(JWT_PAYLOAD);

      expect(result.response.accessToken).toBe(ACCESS_TOKEN);
      const payload = jwtService.sign.mock.calls[0][0];
      expect(payload.permissions).toEqual([]);
    });

    it('reflects updated permissions when role permissions changed between logins', async () => {
      // User had orders.read + orders.write, but now role only has clients.read
      const updatedUser = buildUser({
        role: {
          id: ROLE_ID,
          permissions: [{ permission: { module: 'clients', action: 'read' } }],
        },
      });
      prisma.user.findUnique.mockResolvedValue(updatedUser);

      await service.refreshTokens(JWT_PAYLOAD);

      const payload = jwtService.sign.mock.calls[0][0];
      expect(payload.permissions).toEqual(['clients.read']);
      expect(payload.permissions).not.toContain('orders.read');
    });

    it('reflects added permissions when new permissions granted to role', async () => {
      const updatedUser = buildUser({
        role: {
          id: ROLE_ID,
          permissions: [
            { permission: { module: 'orders', action: 'read' } },
            { permission: { module: 'orders', action: 'write' } },
            { permission: { module: 'analytics', action: 'view' } },
          ],
        },
      });
      prisma.user.findUnique.mockResolvedValue(updatedUser);

      await service.refreshTokens(JWT_PAYLOAD);

      const payload = jwtService.sign.mock.calls[0][0];
      expect(payload.permissions).toEqual([
        'orders.read',
        'orders.write',
        'analytics.view',
      ]);
    });
  });

  // =========================================================================
  // forgotPassword()
  // =========================================================================

  describe('forgotPassword()', () => {
    it('creates a reset token and sends email for existing user', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      prisma.tenant.findUnique.mockResolvedValue({
        id: TENANT_ID,
        deletedAt: null,
      });

      await service.forgotPassword({ email: 'jane@example.com' });

      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            token: expect.any(String),
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });

    it('silently returns without creating token when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.forgotPassword({ email: 'nonexistent@example.com' });

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('silently returns when user is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ isActive: false }));

      await service.forgotPassword({ email: 'jane@example.com' });

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // resetPassword()
  // =========================================================================

  describe('resetPassword()', () => {
    const RESET_TOKEN = 'valid-reset-token';

    it('updates password and marks token as used', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-id',
        userId: USER_ID,
        token: RESET_TOKEN,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        usedAt: null,
      });
      mockedArgon2.hash.mockResolvedValue('$argon2id$new-hash');
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: { update: jest.fn().mockResolvedValue(undefined) },
          passwordResetToken: {
            update: jest.fn().mockResolvedValue(undefined),
          },
        };
        return fn(tx);
      });
      prisma.user.findUnique.mockResolvedValue(buildUser());

      await service.resetPassword({
        token: RESET_TOKEN,
        newPassword: 'NewPass123!',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException for expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-id',
        userId: USER_ID,
        token: RESET_TOKEN,
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      });

      await expect(
        service.resetPassword({
          token: RESET_TOKEN,
          newPassword: 'NewPass123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for already used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-id',
        userId: USER_ID,
        token: RESET_TOKEN,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        usedAt: new Date(),
      });

      await expect(
        service.resetPassword({
          token: RESET_TOKEN,
          newPassword: 'NewPass123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for non-existent token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'invalid', newPassword: 'NewPass123!' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
