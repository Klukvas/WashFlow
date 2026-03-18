import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SuperAdminGuard } from './superadmin.guard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const buildContext = (user: Record<string, unknown> | undefined): ExecutionContext =>
  ({
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({ user }),
    }),
  }) as unknown as ExecutionContext;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard;

  beforeEach(() => {
    guard = new SuperAdminGuard();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('when user is a super admin', () => {
    it('returns true', () => {
      const context = buildContext({ isSuperAdmin: true });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('when user is NOT a super admin', () => {
    it('throws ForbiddenException', () => {
      const context = buildContext({ isSuperAdmin: false });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('throws with "Super-admin access required" message', () => {
      const context = buildContext({ isSuperAdmin: false });
      expect(() => guard.canActivate(context)).toThrow(
        'Super-admin access required',
      );
    });
  });

  describe('when user is undefined', () => {
    it('throws ForbiddenException', () => {
      const context = buildContext(undefined);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('when user is null', () => {
    it('throws ForbiddenException', () => {
      const context = buildContext(null as any);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('when user has no isSuperAdmin property', () => {
    it('throws ForbiddenException', () => {
      const context = buildContext({ email: 'user@test.com' });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('when isSuperAdmin is explicitly false', () => {
    it('throws ForbiddenException', () => {
      const context = buildContext({
        isSuperAdmin: false,
        email: 'admin@test.com',
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
