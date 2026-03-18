import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';
import { JwtPayload } from '../types/jwt-payload.type';

function getDecoratorFactory(decorator: ParameterDecorator) {
  class TestClass {
    test(@((decorator as any)()) _val: unknown) {}
  }
  const meta = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestClass, 'test');
  return meta[Object.keys(meta)[0]].factory;
}

const mockUser: JwtPayload = {
  sub: 'user-1',
  tenantId: 'tenant-1',
  branchId: null,
  email: 'user@example.com',
  type: 'access',
  isSuperAdmin: false,
  permissions: ['orders.read'],
  tokenVersion: 1,
};

function makeCtx(user: JwtPayload): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('CurrentUser decorator', () => {
  let factory: (
    data: keyof JwtPayload | undefined,
    ctx: ExecutionContext,
  ) => unknown;

  beforeEach(() => {
    factory = getDecoratorFactory(CurrentUser as unknown as ParameterDecorator);
  });

  it('should return the full user object when no data key is provided', () => {
    const ctx = makeCtx(mockUser);
    expect(factory(undefined, ctx)).toEqual(mockUser);
  });

  it('should return a specific field when data key is provided', () => {
    const ctx = makeCtx(mockUser);
    expect(factory('sub', ctx)).toBe('user-1');
  });

  it('should return tenantId when data key is "tenantId"', () => {
    const ctx = makeCtx(mockUser);
    expect(factory('tenantId', ctx)).toBe('tenant-1');
  });

  it('should return isSuperAdmin when data key is "isSuperAdmin"', () => {
    const ctx = makeCtx(mockUser);
    expect(factory('isSuperAdmin', ctx)).toBe(false);
  });
});
