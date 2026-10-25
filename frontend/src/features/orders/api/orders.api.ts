import {
  apiClient,
  withIdempotencyKey,
  toPaginated,
} from '@/shared/api/client';
import type {
  ApiResponse,
  PaginatedApiResponse,
  PaginatedResponse,
  TimeSlot,
} from '@/shared/types/api';
import type { Order } from '@/shared/types/models';
import type { OrderStatus } from '@/shared/types/enums';

export interface OrderQueryParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  includeDeleted?: boolean;
  status?: OrderStatus;
  branchId?: string;
  clientId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateOrderPayload {
  branchId: string;
  clientId: string;
  vehicleId: string;
  workPostId?: string;
  assignedEmployeeId?: string;
  scheduledStart: string;
  serviceIds: string[];
  source?: string;
  notes?: string;
}

export interface UpdateOrderStatusPayload {
  status: OrderStatus;
  cancellationReason?: string;
}

export interface AvailabilityParams {
  branchId: string;
  date: string;
  durationMinutes?: number;
  workPostId?: string;
  assignedEmployeeId?: string;
  excludeOrderId?: string;
}

export async function fetchOrders(
  params: OrderQueryParams,
): Promise<PaginatedResponse<Order>> {
  const { data } = await apiClient.get<PaginatedApiResponse<Order>>('/orders', {
    params,
  });
  return toPaginated(data);
}

export async function fetchOrder(id: string): Promise<Order> {
  const { data } = await apiClient.get<ApiResponse<Order>>(`/orders/${id}`);
  return data.data;
}

export async function createOrder(payload: CreateOrderPayload): Promise<Order> {
  const { data } = await apiClient.post<ApiResponse<Order>>(
    '/orders',
    payload,
    withIdempotencyKey(),
  );
  return data.data;
}

export async function updateOrderStatus(
  id: string,
  payload: UpdateOrderStatusPayload,
): Promise<Order> {
  const { data } = await apiClient.patch<ApiResponse<Order>>(
    `/orders/${id}/status`,
    payload,
  );
  return data.data;
}

export async function deleteOrder(id: string): Promise<void> {
  await apiClient.delete(`/orders/${id}`);
}

export async function restoreOrder(id: string): Promise<Order> {
  const { data } = await apiClient.patch<ApiResponse<Order>>(
    `/orders/${id}/restore`,
  );
  return data.data;
}

export async function fetchAvailability(
  params: AvailabilityParams,
): Promise<TimeSlot[]> {
  const { data } = await apiClient.get<ApiResponse<TimeSlot[]>>(
    '/orders/availability',
    { params },
  );
  return data.data;
}

export type RescheduleOrderPayload = {
  scheduledStart: string;
  workPostId?: string;
  assignedEmployeeId?: string;
};
export type ScheduleOrder = {
  id: string;
  status: OrderStatus;
  scheduledStart: string;
  scheduledEnd: string;
  workPost: { id: string; name: string } | null;
  vehicle: { licensePlate: string | null } | null;
  services: { name: string }[];
  assignedEmployee: { id: string; name: string } | null;
  isOverdue: boolean;
};
export type BranchSchedule = {
  branchId: string;
  date: string;
  timezone: string;
  range: { start: string; end: string };
  now: string;
  orders: ScheduleOrder[];
};
export async function fetchSchedule(
  branchId: string,
  date: string,
): Promise<BranchSchedule> {
  const { data } = await apiClient.get<ApiResponse<BranchSchedule>>(
    '/orders/schedule',
    { params: { branchId, date } },
  );
  return data.data;
}
export async function rescheduleOrder(
  id: string,
  payload: RescheduleOrderPayload,
): Promise<Order> {
  const { data } = await apiClient.patch<ApiResponse<Order>>(
    `/orders/${id}/reschedule`,
    payload,
  );
  return data.data;
}
