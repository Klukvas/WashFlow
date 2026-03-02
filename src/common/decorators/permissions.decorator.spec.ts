import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, Permissions } from './permissions.decorator';

describe('Permissions decorator', () => {
  it('should set PERMISSIONS_KEY metadata with provided permissions', () => {
    class TestClass {
      @Permissions('orders.read', 'orders.create')
      testMethod() {}
    }

    const reflector = new Reflector();
    const meta = reflector.get<string[]>(
      PERMISSIONS_KEY,
      TestClass.prototype.testMethod,
    );
    expect(meta).toEqual(['orders.read', 'orders.create']);
  });

  it('should set metadata with a single permission', () => {
    class TestClass {
      @Permissions('users.read')
      singlePerm() {}
    }

    const reflector = new Reflector();
    const meta = reflector.get<string[]>(
      PERMISSIONS_KEY,
      TestClass.prototype.singlePerm,
    );
    expect(meta).toEqual(['users.read']);
  });

  it('should set metadata with no permissions (empty array)', () => {
    class TestClass {
      @Permissions()
      noPerm() {}
    }

    const reflector = new Reflector();
    const meta = reflector.get<string[]>(
      PERMISSIONS_KEY,
      TestClass.prototype.noPerm,
    );
    expect(meta).toEqual([]);
  });

  it('should export PERMISSIONS_KEY constant', () => {
    expect(PERMISSIONS_KEY).toBe('permissions');
  });
});
