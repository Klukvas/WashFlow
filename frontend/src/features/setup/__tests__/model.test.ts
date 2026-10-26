import { describe, expect, it, vi } from 'vitest';
import {
  eligibleBranch,
  postFact,
  queryFact,
  serviceFact,
  validTimezone,
} from '../model';
import type { Branch } from '@/shared/types/models';
const branch = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  name: 'Wash',
  timezone: 'Europe/Kyiv',
  isActive: true,
  deletedAt: null,
} as Branch;
const post = {
  id: branch.id,
  tenantId: branch.tenantId,
  branchId: branch.id,
  isActive: true,
  deletedAt: null,
};
const service = {
  id: branch.id,
  tenantId: branch.tenantId,
  isActive: true,
  deletedAt: null,
  durationMin: 30,
  price: '0.00',
};
describe('setup facts', () => {
  it('requires a known active undeleted branch and timezone', () => {
    expect(eligibleBranch(branch)).toBe(true);
    expect(eligibleBranch({ ...branch, isActive: false })).toBe(false);
    expect(eligibleBranch({ ...branch, deletedAt: '2026-01-01' })).toBe(false);
    expect(validTimezone(branch.timezone)).toBe(true);
    expect(validTimezone('not/a-zone')).toBe(false);
  });
  it('uses actual branch post scope and refuses unknown flags', () => {
    expect(postFact([post], branch).state).toBe('complete');
    expect(postFact([], branch).state).toBe('incomplete');
    expect(postFact([{ ...post, isActive: false }], branch).state).toBe(
      'incomplete',
    );
    expect(postFact([{ ...post, deletedAt: 'deleted' }], branch).state).toBe(
      'incomplete',
    );
    expect(postFact([{ ...post, isActive: undefined }], branch).state).toBe(
      'unavailable',
    );
    expect(
      postFact([{ ...post, branchId: branch.tenantId }], branch).state,
    ).toBe('unavailable');
  });
  it('accepts tenant-global zero-price service, no invented branch requirement', () => {
    expect(serviceFact([service], branch).state).toBe('complete');
    for (const patch of [
      { durationMin: 0 },
      { isActive: false },
      { deletedAt: 'deleted' },
    ])
      expect(serviceFact([{ ...service, ...patch }], branch).state).toBe(
        'incomplete',
      );
    expect(
      serviceFact([{ ...service, tenantId: branch.id }], branch).state,
    ).toBe('unavailable');
  });
  it.each([null, {}, [null], [1], ['bad'], [{ id: 'bad' }]])(
    'malformed resource %j is error not complete',
    (value) => {
      expect(postFact(value, branch).state).toBe('error');
      expect(serviceFact(value, branch).state).toBe('error');
    },
  );
  it('suppresses cached complete while refetching and provides retry on error', () => {
    const refetch = vi.fn();
    expect(
      queryFact(
        { isFetching: true, isPending: false, isError: false, refetch },
        { state: 'complete' },
      ).state,
    ).toBe('loading');
    const fact = queryFact(
      { isFetching: false, isPending: false, isError: true, refetch },
      { state: 'complete' },
    );
    expect(fact.state).toBe('error');
    if (fact.state === 'error') fact.retry();
    expect(refetch).toHaveBeenCalledOnce();
  });
});
