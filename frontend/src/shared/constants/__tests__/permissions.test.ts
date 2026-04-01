import { describe, it, expect } from 'vitest';
import { PERMISSIONS } from '../permissions';

describe('PERMISSIONS', () => {
  it('has CRUD permissions for core resources', () => {
    const crudResources = [
      'TENANTS',
      'BRANCHES',
      'USERS',
      'ROLES',
      'CLIENTS',
      'VEHICLES',
      'SERVICES',
      'WORK_POSTS',
      'ORDERS',
      'PAYMENTS',
      'WORKFORCE',
    ] as const;

    for (const resource of crudResources) {
      expect(PERMISSIONS[resource].CREATE).toBeDefined();
      expect(PERMISSIONS[resource].READ).toBeDefined();
      expect(PERMISSIONS[resource].UPDATE).toBeDefined();
      expect(PERMISSIONS[resource].DELETE).toBeDefined();
    }
  });

  it('follows the "resource.action" naming convention', () => {
    const allPermissions = Object.entries(PERMISSIONS).flatMap(
      ([, actions]) => Object.values(actions),
    );

    for (const perm of allPermissions) {
      expect(perm).toMatch(/^[\w-]+\.\w+$/);
    }
  });

  it('has no duplicate permission strings', () => {
    const allPermissions = Object.entries(PERMISSIONS).flatMap(
      ([, actions]) => Object.values(actions),
    );

    const unique = new Set(allPermissions);
    expect(unique.size).toBe(allPermissions.length);
  });

  it('has read-only permissions for scheduling', () => {
    expect(PERMISSIONS.SCHEDULING.READ).toBe('scheduling.read');
    expect(
      'CREATE' in PERMISSIONS.SCHEDULING,
    ).toBe(false);
  });

  it('has view permission for analytics', () => {
    expect(PERMISSIONS.ANALYTICS.VIEW).toBe('analytics.view');
  });

  it('has read-only permission for audit', () => {
    expect(PERMISSIONS.AUDIT.READ).toBe('audit.read');
  });

  it('permission values match their resource prefix', () => {
    expect(PERMISSIONS.ORDERS.CREATE).toBe('orders.create');
    expect(PERMISSIONS.ORDERS.READ).toBe('orders.read');
    expect(PERMISSIONS.USERS.DELETE).toBe('users.delete');
    expect(PERMISSIONS.BRANCHES.UPDATE).toBe('branches.update');
    expect(PERMISSIONS.WORK_POSTS.READ).toBe('work-posts.read');
  });
});
