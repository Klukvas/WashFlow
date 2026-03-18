import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchVehicles,
  fetchVehicle,
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

export function useVehicle(id: string) {
  return useQuery({
    queryKey: ['vehicles', 'detail', id],
    queryFn: () => fetchVehicle(id),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateVehiclePayload) => createVehicle(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create vehicle');
    },
  });
}

export function useUpdateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: Partial<CreateVehiclePayload> & { id: string }) =>
      updateVehicle(id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['vehicles', 'detail', id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update vehicle');
    },
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteVehicle(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['vehicles', 'detail', id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete vehicle');
    },
  });
}

export function useRestoreVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreVehicle(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['vehicles', 'detail', id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to restore vehicle');
    },
  });
}
