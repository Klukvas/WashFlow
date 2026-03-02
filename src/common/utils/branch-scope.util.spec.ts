import { applyBranchScope } from './branch-scope.util';

describe('applyBranchScope', () => {
  it('should return the original where object unchanged when branchId is null', () => {
    const where = { tenantId: 'tenant-1', active: true };
    const result = applyBranchScope(where, null);
    expect(result).toBe(where); // same reference
  });

  it('should add branchId field when branchId is provided', () => {
    const where = { tenantId: 'tenant-1' };
    const result = applyBranchScope(where, 'branch-1');
    expect(result).toEqual({ tenantId: 'tenant-1', branchId: 'branch-1' });
  });

  it('should not mutate the original where object', () => {
    const where = { tenantId: 'tenant-1' };
    applyBranchScope(where, 'branch-1');
    expect(where).toEqual({ tenantId: 'tenant-1' });
    expect((where as Record<string, unknown>).branchId).toBeUndefined();
  });

  it('should use a custom fieldName when provided', () => {
    const where = { tenantId: 'tenant-1' };
    const result = applyBranchScope(where, 'branch-1', 'id');
    expect(result).toEqual({ tenantId: 'tenant-1', id: 'branch-1' });
  });

  it('should default fieldName to "branchId" when not specified', () => {
    const where = {};
    const result = applyBranchScope(where, 'branch-99');
    expect(result).toEqual({ branchId: 'branch-99' });
  });

  it('should preserve all existing where fields', () => {
    const where = { tenantId: 'tenant-1', status: 'ACTIVE', deletedAt: null };
    const result = applyBranchScope(where, 'branch-2');
    expect(result).toEqual({
      tenantId: 'tenant-1',
      status: 'ACTIVE',
      deletedAt: null,
      branchId: 'branch-2',
    });
  });
});
