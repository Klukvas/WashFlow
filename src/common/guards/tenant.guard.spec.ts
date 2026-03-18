import {
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { JwtPayload } from '../types/jwt-payload.type';

const mockReflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };

const mockPrisma = {
  tenant: {
    findUnique: jest.fn(),
  },
};

const mockEventDispatcher = {
  dispatch: jest.fn(),
};

const mockModuleRef = {
  get: jest.fn((token: any) => {
    if (token.name === 'PrismaService' || token === 'PrismaService') {
      return mockPrisma;
    }
    if (
      token.name === 'EventDispatcherService' ||
      token === 'EventDispatcherService'
    ) {
      return mockEventDispatcher;
    }
    return null;
  }),
};

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
    jest.clearAllMocks();
    mockReflector.getAllAndOverride.mockReturnValue(false);
    guard = new TenantGuard(mockReflector as any, mockModuleRef as any);
  });

  it('should throw ForbiddenException when no user is on the request', async () => {
    const ctx = makeCtx(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException with correct message when user is absent', async () => {
    const ctx = makeCtx(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'No authenticated user found',
    );
  });

  describe('super admin', () => {
    it('should return true for a super admin without x-tenant-id header', async () => {
      const user: Partial<JwtPayload> = {
        isSuperAdmin: true,
        tenantId: 'tenant-1',
      };
      const ctx = makeCtx(user);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('should override tenantId with x-tenant-id header for super admin', async () => {
      const validUuid = '00000000-0000-0000-0000-000000000001';
      const user: Partial<JwtPayload> = {
        isSuperAdmin: true,
        tenantId: 'tenant-original',
        sub: 'admin-id',
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

      mockPrisma.tenant.findUnique.mockResolvedValue({ id: validUuid });

      await guard.canActivate(ctx);
      expect(request.user.tenantId).toBe(validUuid);
    });

    it('should throw BadRequestException when x-tenant-id is not a valid UUID', async () => {
      const user: Partial<JwtPayload> = {
        isSuperAdmin: true,
        tenantId: 'tenant-original',
      };
      const ctx = makeCtx(user, { 'x-tenant-id': 'not-a-uuid' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when tenant UUID does not exist in DB', async () => {
      const validUuid = '00000000-0000-0000-0000-000000000099';
      const user: Partial<JwtPayload> = {
        isSuperAdmin: true,
        tenantId: 'tenant-original',
        sub: 'admin-id',
      };
      const ctx = makeCtx(user, { 'x-tenant-id': validUuid });

      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        BadRequestException,
      );
      await expect(guard.canActivate(ctx)).rejects.toThrow('Tenant not found');
    });

    it('should dispatch SuperAdminTenantAccessEvent when overriding tenant', async () => {
      const validUuid = '00000000-0000-0000-0000-000000000001';
      const user: Partial<JwtPayload> = {
        isSuperAdmin: true,
        tenantId: 'tenant-original',
        sub: 'admin-id',
      };
      const ctx = makeCtx(user, { 'x-tenant-id': validUuid });

      mockPrisma.tenant.findUnique.mockResolvedValue({ id: validUuid });

      await guard.canActivate(ctx);

      expect(mockEventDispatcher.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: validUuid,
          payload: {
            superAdminId: 'admin-id',
            targetTenantId: validUuid,
          },
        }),
      );
    });

    it('should NOT override tenantId when x-tenant-id header is absent', async () => {
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

      await guard.canActivate(ctx);
      expect(request.user.tenantId).toBe('tenant-original');
    });
  });

  it('returns true when route is marked @Public()', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(true);
    const ctx = makeCtx(undefined); // no user at all
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  describe('regular user', () => {
    it('should return true when user has a tenantId', async () => {
      const user: Partial<JwtPayload> = {
        isSuperAdmin: false,
        tenantId: 'tenant-1',
      };
      const ctx = makeCtx(user);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('should throw ForbiddenException when user has no tenantId', async () => {
      const user: Partial<JwtPayload> = {
        isSuperAdmin: false,
        tenantId: undefined,
      };
      const ctx = makeCtx(user as JwtPayload);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException with correct message when tenantId is missing', async () => {
      const user: Partial<JwtPayload> = { isSuperAdmin: false };
      const ctx = makeCtx(user as JwtPayload);
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'User is not associated with any tenant',
      );
    });
  });
});
