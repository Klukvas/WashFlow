import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  restoreVehicle,
  type VehicleQueryParams,
  type CreateVehiclePayload,
} from '../api/vehicles.api';

export function useVehicles(params: VehicleQueryParams) {
  return useQuery({
    queryKey: ['vehicles', params],
    queryFn: () => fetchVehicles(params),
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateVehiclePayload) => createVehicle(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });
}

export function useUpdateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: Partial<CreateVehiclePayload> & { id: string }) =>
      updateVehicle(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteVehicle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });
}

export function useRestoreVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreVehicle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });
}
