/**
 * Merges branch scoping into a Prisma where clause (immutably).
 * When branchId is null, returns the original where unchanged (full access).
 * When branchId is non-null, adds { [fieldName]: branchId } to the where clause.
 *
 * For models where the branch filter field is not called "branchId"
 * (e.g., Branch model uses "id"), pass fieldName explicitly.
 */
export function applyBranchScope<T extends Record<string, unknown>>(
  where: T,
  branchId: string | null,
  fieldName: string = 'branchId',
): T {
  if (branchId === null) {
    return where;
  }
  return { ...where, [fieldName]: branchId } as T;
}
