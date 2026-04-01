import { describe, it, expect } from 'vitest';
import {
  buildViolations,
  type ResourceKey,
  type Violation,
} from '../downgradeValidation';

function makeUsage(
  overrides: Partial<
    Record<ResourceKey, { current: number; max: number | null }>
  > = {},
): Record<ResourceKey, { current: number; max: number | null }> {
  return {
    branches: { current: 1, max: null },
    workPosts: { current: 2, max: null },
    users: { current: 3, max: null },
    services: { current: 5, max: null },
    ...overrides,
  };
}

function makeLimits(
  overrides: Partial<Record<ResourceKey, number | null>> = {},
): Record<ResourceKey, number | null> {
  return {
    branches: null,
    workPosts: null,
    users: null,
    services: null,
    ...overrides,
  };
}

describe('buildViolations', () => {
  it('returns empty array when all limits are null (unlimited)', () => {
    const violations = buildViolations(makeUsage(), makeLimits());
    expect(violations).toEqual([]);
  });

  it('returns empty array when usage is within limits', () => {
    const usage = makeUsage({
      branches: { current: 2, max: null },
      users: { current: 5, max: null },
    });
    const limits = makeLimits({ branches: 5, users: 10 });

    const violations = buildViolations(usage, limits);
    expect(violations).toEqual([]);
  });

  it('returns violations when usage exceeds limits', () => {
    const usage = makeUsage({
      branches: { current: 5, max: null },
      users: { current: 10, max: null },
    });
    const limits = makeLimits({ branches: 3, users: 5 });

    const violations = buildViolations(usage, limits);

    expect(violations).toHaveLength(2);

    const branchViolation = violations.find(
      (v) => v.resource === 'branches',
    ) as Violation;
    expect(branchViolation.current).toBe(5);
    expect(branchViolation.limit).toBe(3);
    expect(branchViolation.managePath).toBe('/branches');

    const userViolation = violations.find(
      (v) => v.resource === 'users',
    ) as Violation;
    expect(userViolation.current).toBe(10);
    expect(userViolation.limit).toBe(5);
    expect(userViolation.managePath).toBe('/users');
  });

  it('does not flag resources that are exactly at the limit', () => {
    const usage = makeUsage({
      branches: { current: 3, max: null },
    });
    const limits = makeLimits({ branches: 3 });

    const violations = buildViolations(usage, limits);
    expect(violations).toEqual([]);
  });

  it('checks all four resource types', () => {
    const usage = makeUsage({
      branches: { current: 10, max: null },
      workPosts: { current: 10, max: null },
      users: { current: 10, max: null },
      services: { current: 10, max: null },
    });
    const limits = makeLimits({
      branches: 1,
      workPosts: 1,
      users: 1,
      services: 1,
    });

    const violations = buildViolations(usage, limits);
    expect(violations).toHaveLength(4);

    const resources = violations.map((v) => v.resource);
    expect(resources).toContain('branches');
    expect(resources).toContain('workPosts');
    expect(resources).toContain('users');
    expect(resources).toContain('services');
  });

  it('includes correct managePath for each resource', () => {
    const usage = makeUsage({
      branches: { current: 5, max: null },
      workPosts: { current: 5, max: null },
      users: { current: 5, max: null },
      services: { current: 5, max: null },
    });
    const limits = makeLimits({
      branches: 1,
      workPosts: 1,
      users: 1,
      services: 1,
    });

    const violations = buildViolations(usage, limits);
    const pathMap = Object.fromEntries(
      violations.map((v) => [v.resource, v.managePath]),
    );

    expect(pathMap.branches).toBe('/branches');
    expect(pathMap.workPosts).toBe('/work-posts');
    expect(pathMap.users).toBe('/users');
    expect(pathMap.services).toBe('/services');
  });

  it('skips resources with null target limit even when current is high', () => {
    const usage = makeUsage({
      branches: { current: 100, max: null },
    });
    const limits = makeLimits({ branches: null });

    const violations = buildViolations(usage, limits);
    expect(violations).toEqual([]);
  });
});
