import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../../common/types/jwt-payload.type';

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
    update: jest.Mock;
  };
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
        update: jest.fn().mockResolvedValue(undefined),
      },
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

      it('does not call argon2.verify when user is inactive', async () => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ isActive: false }),
        );

        await expect(service.login(LOGIN_DTO)).rejects.toThrow(
          UnauthorizedException,
        );
        expect(mockedArgon2.verify).not.toHaveBeenCalled();
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
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ deletedAt: new Date() }),
        );

        await expect(service.login(LOGIN_DTO)).rejects.toThrow(
          UnauthorizedException,
        );
        expect(mockedArgon2.verify).not.toHaveBeenCalled();
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
        mockedArgon2.verify.mockResolvedValue(true);
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
        mockedArgon2.verify.mockResolvedValue(true);
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
        mockedArgon2.verify.mockResolvedValue(true);
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
});
