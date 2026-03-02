import axios from 'axios';
import type { ApiResponse, TimeSlot } from '@/shared/types/api';
import type { Service, Branch, Order } from '@/shared/types/models';

const publicClient = axios.create({
  baseURL: '/api/v1/public/booking',
  headers: { 'Content-Type': 'application/json' },
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

export async function fetchPublicServices(slug: string): Promise<Service[]> {
  const { data } = await publicClient.get<ApiResponse<Service[]>>(
    `/${slug}/services`,
  );
  return data.data;
}

export async function fetchPublicBranches(slug: string): Promise<Branch[]> {
  const { data } = await publicClient.get<ApiResponse<Branch[]>>(
    `/${slug}/branches`,
  );
  return data.data;
}

export async function fetchPublicAvailability(
  slug: string,
  params: CheckAvailabilityParams,
): Promise<TimeSlot[]> {
  const { data } = await publicClient.get<ApiResponse<TimeSlot[]>>(
    `/${slug}/availability`,
    { params },
  );
  return data.data;
}

export async function createPublicBooking(
  slug: string,
  payload: CreateBookingPayload,
): Promise<Order> {
  const { data } = await publicClient.post<ApiResponse<Order>>(
    `/${slug}/book`,
    payload,
    {
      headers: {
        'idempotency-key': crypto.randomUUID(),
      },
    },
  );
  return data.data;
}
