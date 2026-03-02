import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentTenant } from './current-tenant.decorator';

function getDecoratorFactory(decorator: ParameterDecorator) {
  class TestClass {
    test(@(decorator as any)() _val: unknown) {}
  }
  const meta = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestClass, 'test');
  return meta[Object.keys(meta)[0]].factory;
}

function makeCtx(tenantId: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { tenantId } }),
    }),
  } as unknown as ExecutionContext;
}

describe('CurrentTenant decorator', () => {
  let factory: (data: unknown, ctx: ExecutionContext) => string;

  beforeEach(() => {
    factory = getDecoratorFactory(CurrentTenant);
  });

  it('should return tenantId from request.user', () => {
    const ctx = makeCtx('tenant-abc');
    expect(factory(undefined, ctx)).toBe('tenant-abc');
  });

  it('should return the correct tenantId for different values', () => {
    const ctx = makeCtx('tenant-xyz');
    expect(factory(undefined, ctx)).toBe('tenant-xyz');
  });
});
