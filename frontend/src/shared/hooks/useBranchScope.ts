import { useAuthStore } from '@/shared/stores/auth.store';

export function useBranchScope(): {
  branchId: string | null;
  isBranchScoped: boolean;
} {
  const user = useAuthStore((s) => s.user);
  return {
    branchId: user?.branchId ?? null,
    isBranchScoped: user?.branchId != null,
  };
}
