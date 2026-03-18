import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchUsers,
  fetchUser,
  createUser,
  updateUser,
  deleteUser,
  restoreUser,
  type UserQueryParams,
  type CreateUserPayload,
  type UpdateUserPayload,
} from '../api/users.api';

export function useUsers(params: UserQueryParams) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => fetchUsers(params),
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: () => fetchUser(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateUserPayload) => createUser(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create user');
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateUserPayload & { id: string }) =>
      updateUser(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', variables.id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update user');
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete user');
    },
  });
}

export function useRestoreUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to restore user');
    },
  });
}
