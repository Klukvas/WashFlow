import {
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { JwtPayload } from '../types/jwt-payload.type';

const mockReflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };

function makeCtx(
  user: Partial<JwtPayload> | undefined,
  headers: Record<string, string> = {},
): ExecutionContext {
  const request = { user, headers };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('TenantGuard', () => {
  let guard: TenantGuard;

  beforeEach(() => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    guard = new TenantGuard(mockReflector as any);
  });

  it('should throw ForbiddenException when no user is on the request', () => {
    const ctx = makeCtx(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException with correct message when user is absent', () => {
    const ctx = makeCtx(undefined);
    expect(() => guard.canActivate(ctx)).toThrow('No authenticated user found');
  });

  describe('super admin', () => {
    it('should return true for a super admin without x-tenant-id header', () => {
      const user: Partial<JwtPayload> = {
        isSuperAdmin: true,
        tenantId: 'tenant-1',
      };
      const ctx = makeCtx(user);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should override tenantId with x-tenant-id header for super admin', () => {
      const validUuid = '00000000-0000-0000-0000-000000000001';
      const user: Partial<JwtPayload> = {
        isSuperAdmin: true,
        tenantId: 'tenant-original',
      };
      const request = {
        user,
        headers: { 'x-tenant-id': validUuid },
      };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
      } as unknown as ExecutionContext;

      guard.canActivate(ctx);
      expect(request.user.tenantId).toBe(validUuid);
    });

    it('should throw BadRequestException when x-tenant-id is not a valid UUID', () => {
      const user: Partial<JwtPayload> = {
        isSuperAdmin: true,
        tenantId: 'tenant-original',
      };
      const ctx = makeCtx(user, { 'x-tenant-id': 'not-a-uuid' });
      expect(() => guard.canActivate(ctx)).toThrow(BadRequestException);
    });

    it('should NOT override tenantId when x-tenant-id header is absent', () => {
      const user: Partial<JwtPayload> = {
        isSuperAdmin: true,
        tenantId: 'tenant-original',
      };
      const request = { user, headers: {} };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
      } as unknown as ExecutionContext;

      guard.canActivate(ctx);
      expect(request.user.tenantId).toBe('tenant-original');
    });
  });

  describe('regular user', () => {
    it('should return true when user has a tenantId', () => {
      const user: Partial<JwtPayload> = {
        isSuperAdmin: false,
        tenantId: 'tenant-1',
      };
      const ctx = makeCtx(user);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should throw ForbiddenException when user has no tenantId', () => {
      const user: Partial<JwtPayload> = {
        isSuperAdmin: false,
        tenantId: undefined,
      };
      const ctx = makeCtx(user as JwtPayload);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException with correct message when tenantId is missing', () => {
      const user: Partial<JwtPayload> = { isSuperAdmin: false };
      const ctx = makeCtx(user as JwtPayload);
      expect(() => guard.canActivate(ctx)).toThrow(
        'User is not associated with any tenant',
      );
    });
  });
});
