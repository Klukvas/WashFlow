import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchProfiles,
  fetchProfile,
  createProfile,
  updateProfile,
  deactivateProfile,
  type EmployeeProfileQueryParams,
  type CreateEmployeeProfilePayload,
  type UpdateEmployeeProfilePayload,
} from '../api/workforce.api';

const PROFILES_KEY = 'workforce-profiles';

export function useProfiles(params: EmployeeProfileQueryParams = {}) {
  return useQuery({
    queryKey: [PROFILES_KEY, params],
    queryFn: () => fetchProfiles(params),
  });
}

export function useProfile(id: string) {
  return useQuery({
    queryKey: [PROFILES_KEY, id],
    queryFn: () => fetchProfile(id),
    enabled: !!id,
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateEmployeeProfilePayload) => createProfile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROFILES_KEY] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create employee profile');
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateEmployeeProfilePayload }) =>
      updateProfile(id, payload),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [PROFILES_KEY] });
      queryClient.invalidateQueries({ queryKey: [PROFILES_KEY, id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update employee profile');
    },
  });
}

export function useDeactivateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateProfile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROFILES_KEY] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to deactivate employee profile');
    },
  });
}
