import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchRoles,
  fetchRole,
  createRole,
  updateRole,
  deleteRole,
  restoreRole,
  assignPermissions,
  fetchPermissions,
  type RoleQueryParams,
  type CreateRolePayload,
  type UpdateRolePayload,
  type AssignPermissionsPayload,
} from '../api/roles.api';

const ROLES_KEY = ['roles'] as const;
const PERMISSIONS_KEY = ['permissions'] as const;

export function useRoles(params: RoleQueryParams) {
  return useQuery({
    queryKey: [...ROLES_KEY, params],
    queryFn: () => fetchRoles(params),
  });
}

export function useRole(id: string) {
  return useQuery({
    queryKey: [...ROLES_KEY, id],
    queryFn: () => fetchRole(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRolePayload) => createRole(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create role');
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateRolePayload & { id: string }) =>
      updateRole(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
      queryClient.invalidateQueries({ queryKey: [...ROLES_KEY, variables.id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update role');
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete role');
    },
  });
}

export function useRestoreRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreRole(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
      queryClient.invalidateQueries({ queryKey: [...ROLES_KEY, id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to restore role');
    },
  });
}

export function useAssignPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: AssignPermissionsPayload & { id: string }) =>
      assignPermissions(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...ROLES_KEY, variables.id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign permissions');
    },
  });
}

export function usePermissionsList() {
  return useQuery({
    queryKey: PERMISSIONS_KEY,
    queryFn: fetchPermissions,
    staleTime: 5 * 60 * 1000,
  });
}
