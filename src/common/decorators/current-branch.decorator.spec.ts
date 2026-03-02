import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentBranch } from './current-branch.decorator';

function getDecoratorFactory(decorator: ParameterDecorator) {
  class TestClass {
    test(@((decorator as any)()) _val: unknown) {}
  }
  const meta = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestClass, 'test');
  return meta[Object.keys(meta)[0]].factory;
}

function makeCtx(user: Record<string, unknown> | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('CurrentBranch decorator', () => {
  let factory: (data: unknown, ctx: ExecutionContext) => string | null;

  beforeEach(() => {
    factory = getDecoratorFactory(CurrentBranch);
  });

  it('should return branchId when user has one', () => {
    const ctx = makeCtx({ branchId: 'branch-1' });
    expect(factory(undefined, ctx)).toBe('branch-1');
  });

  it('should return null when user has no branchId', () => {
    const ctx = makeCtx({ tenantId: 'tenant-1' });
    expect(factory(undefined, ctx)).toBeNull();
  });

  it('should return null when user is undefined', () => {
    const ctx = makeCtx(undefined);
    expect(factory(undefined, ctx)).toBeNull();
  });
});
