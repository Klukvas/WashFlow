import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { JwtPayload } from '../types/jwt-payload.type';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const buildUser = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: USER_ID,
  tenantId: TENANT_ID,
  branchId: null,
  email: 'user@example.com',
  isSuperAdmin: false,
  permissions: [],
  type: 'access',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const buildReflector = (): jest.Mocked<Reflector> =>
  ({ getAllAndOverride: jest.fn() }) as unknown as jest.Mocked<Reflector>;

/**
 * Builds an ExecutionContext mock that returns `user` on request.user.
 * Pass `null` to simulate a missing user (unauthenticated request).
 */
const buildContext = (user: JwtPayload | null): ExecutionContext =>
  ({
    getHandler: jest.fn().mockReturnValue('handler-sentinel'),
    getClass: jest.fn().mockReturnValue('class-sentinel'),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({ user }),
    }),
  }) as unknown as ExecutionContext;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PermissionsGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = buildReflector();
    guard = new PermissionsGuard(reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // No required permissions — always allow
  // -------------------------------------------------------------------------

  describe('when no permissions are required', () => {
    it('returns true when getAllAndOverride returns undefined', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const context = buildContext(null);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('returns true when getAllAndOverride returns null', () => {
      reflector.getAllAndOverride.mockReturnValue(null);
      const context = buildContext(null);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('returns true when permissions array is empty', () => {
      reflector.getAllAndOverride.mockReturnValue([]);
      const context = buildContext(null);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('does NOT access the HTTP request when permissions are undefined', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const getRequest = jest.fn();
      const context = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({ getRequest }),
      } as unknown as ExecutionContext;

      guard.canActivate(context);

      expect(getRequest).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Super admin bypass
  // -------------------------------------------------------------------------

  describe('when the user is a super admin', () => {
    it('returns true regardless of required permissions', () => {
      reflector.getAllAndOverride.mockReturnValue([
        'orders:read',
        'orders:write',
      ]);
      const superAdmin = buildUser({ isSuperAdmin: true, permissions: [] });
      const context = buildContext(superAdmin);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('returns true even when the super admin has no permissions in the payload', () => {
      reflector.getAllAndOverride.mockReturnValue(['admin:manage']);
      const superAdmin = buildUser({ isSuperAdmin: true, permissions: [] });
      const context = buildContext(superAdmin);

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // User has all required permissions
  // -------------------------------------------------------------------------

  describe('when the user has all required permissions', () => {
    it('returns true for a single matching permission', () => {
      reflector.getAllAndOverride.mockReturnValue(['orders:read']);
      const user = buildUser({ permissions: ['orders:read'] });
      const context = buildContext(user);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('returns true when user holds a superset of required permissions', () => {
      reflector.getAllAndOverride.mockReturnValue(['orders:read']);
      const user = buildUser({
        permissions: ['orders:read', 'orders:write', 'clients:read'],
      });
      const context = buildContext(user);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('returns true when ALL of multiple required permissions are present', () => {
      reflector.getAllAndOverride.mockReturnValue([
        'orders:read',
        'orders:write',
        'clients:read',
      ]);
      const user = buildUser({
        permissions: ['orders:read', 'orders:write', 'clients:read'],
      });
      const context = buildContext(user);

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // No authenticated user
  // -------------------------------------------------------------------------

  describe('when there is no user on the request', () => {
    it('throws ForbiddenException with the correct message', () => {
      reflector.getAllAndOverride.mockReturnValue(['orders:read']);
      const context = buildContext(null);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('throws with message "No authenticated user found"', () => {
      reflector.getAllAndOverride.mockReturnValue(['orders:read']);
      const context = buildContext(null);

      expect(() => guard.canActivate(context)).toThrow(
        'No authenticated user found',
      );
    });
  });

  // -------------------------------------------------------------------------
  // User lacks required permissions
  // -------------------------------------------------------------------------

  describe('when the user is missing required permissions', () => {
    it('throws ForbiddenException when user has no permissions at all', () => {
      reflector.getAllAndOverride.mockReturnValue(['orders:read']);
      const user = buildUser({ permissions: [] });
      const context = buildContext(user);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('throws with message "Insufficient permissions"', () => {
      reflector.getAllAndOverride.mockReturnValue(['orders:read']);
      const user = buildUser({ permissions: [] });
      const context = buildContext(user);

      expect(() => guard.canActivate(context)).toThrow(
        'Insufficient permissions',
      );
    });

    it('throws when user has some but not all required permissions', () => {
      reflector.getAllAndOverride.mockReturnValue([
        'orders:read',
        'orders:write',
      ]);
      const user = buildUser({ permissions: ['orders:read'] });
      const context = buildContext(user);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('throws when user has completely different permissions', () => {
      reflector.getAllAndOverride.mockReturnValue(['orders:read']);
      const user = buildUser({ permissions: ['clients:read'] });
      const context = buildContext(user);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('does not allow partial prefix matches (e.g. "orders" does not satisfy "orders:read")', () => {
      reflector.getAllAndOverride.mockReturnValue(['orders:read']);
      const user = buildUser({ permissions: ['orders'] });
      const context = buildContext(user);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // Reflector usage
  // -------------------------------------------------------------------------

  describe('reflector.getAllAndOverride invocation', () => {
    it('is called with PERMISSIONS_KEY as the metadata key', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const context = buildContext(null);

      guard.canActivate(context);

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
        PERMISSIONS_KEY,
        expect.any(Array),
      );
    });

    it('passes [handler, class] targets to reflector in that order', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const context = buildContext(null);

      guard.canActivate(context);

      const [, targets] = reflector.getAllAndOverride.mock.calls[0];
      expect(targets).toEqual([context.getHandler(), context.getClass()]);
    });

    it('is called exactly once per canActivate invocation', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const context = buildContext(null);

      guard.canActivate(context);

      expect(reflector.getAllAndOverride).toHaveBeenCalledTimes(1);
    });
  });
});
