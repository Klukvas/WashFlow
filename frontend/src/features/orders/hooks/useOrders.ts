import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchOrders,
  fetchOrder,
  createOrder,
  updateOrderStatus,
  deleteOrder,
  restoreOrder,
  fetchAvailability,
  fetchSchedule,
  rescheduleOrder,
  type RescheduleOrderPayload,
  type OrderQueryParams,
  type CreateOrderPayload,
  type UpdateOrderStatusPayload,
  type AvailabilityParams,
} from '../api/orders.api';

export function useOrders(params: OrderQueryParams) {
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => fetchOrders(params),
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => fetchOrder(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateOrderPayload) => createOrder(payload),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['day-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create order');
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: UpdateOrderStatusPayload & { id: string }) =>
      updateOrderStatus(id, payload),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['day-summary'] });
      queryClient.invalidateQueries({ queryKey: ['orders', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update order status');
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOrder(id),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['day-summary'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete order');
    },
  });
}

export function useRestoreOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreOrder(id),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['day-summary'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to restore order');
    },
  });
}

export function useAvailability(params: AvailabilityParams) {
  return useQuery({
    queryKey: ['availability', params],
    queryFn: () => fetchAvailability(params),
    enabled: !!params.branchId && !!params.date,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}

export function useSchedule(branchId: string, date: string) {
  return useQuery({
    queryKey: ['orders', 'schedule', branchId, date],
    queryFn: () => fetchSchedule(branchId, date),
    enabled: !!branchId && !!date,
    refetchInterval: 60_000,
  });
}
export function useRescheduleOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: RescheduleOrderPayload & { id: string }) =>
      rescheduleOrder(id, payload),
    onSettled: () => {
      for (const key of ['orders', 'availability', 'dashboard', 'day-summary'])
        qc.invalidateQueries({ queryKey: [key] });
    },
  });
}
