import axios from 'axios';
import { TENANT_ID } from '@/config/tenant';
import type { ApiResponse, TimeSlot } from '@/types/api';
import type { Service, Branch, Order } from '@/types/models';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

const widgetClient = axios.create({
  baseURL: `${apiBaseUrl || ''}/api/v1/public/widget`,
  headers: {
    'Content-Type': 'application/json',
    'x-carwash-tenant-id': TENANT_ID,
  },
});

export interface CheckAvailabilityParams {
  branchId: string;
  date: string;
  durationMinutes?: number;
  workPostId?: string;
}

export interface CreateBookingPayload {
  branchId: string;
  workPostId?: string;
  scheduledStart: string;
  serviceIds: string[];
  firstName: string;
  lastName?: string;
  phone: string;
  email?: string;
  licensePlate: string;
  vehicleMake?: string;
  vehicleModel?: string;
  notes?: string;
}

export async function fetchServices(): Promise<Service[]> {
  const { data } = await widgetClient.get<ApiResponse<Service[]>>('/services');
  return data.data;
}

export async function fetchBranches(): Promise<Branch[]> {
  const { data } = await widgetClient.get<ApiResponse<Branch[]>>('/branches');
  return data.data;
}

export async function fetchAvailability(
  params: CheckAvailabilityParams,
): Promise<TimeSlot[]> {
  const { data } = await widgetClient.get<ApiResponse<TimeSlot[]>>(
    '/availability',
    { params },
  );
  return data.data;
}

export async function createBooking(
  payload: CreateBookingPayload,
): Promise<Order> {
  const { data } = await widgetClient.post<ApiResponse<Order>>(
    '/book',
    payload,
    {
      headers: {
        'idempotency-key': crypto.randomUUID(),
      },
    },
  );
  return data.data;
}
