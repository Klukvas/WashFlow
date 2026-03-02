import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchOrders,
  fetchOrder,
  createOrder,
  updateOrderStatus,
  deleteOrder,
  restoreOrder,
  fetchAvailability,
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
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
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
      queryClient.invalidateQueries({ queryKey: ['orders', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOrder(id),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useRestoreOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreOrder(id),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useAvailability(params: AvailabilityParams) {
  return useQuery({
    queryKey: ['availability', params],
    queryFn: () => fetchAvailability(params),
    enabled: !!params.branchId && !!params.date,
    staleTime: 10 * 1000,
  });
}
