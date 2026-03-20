import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isAxiosError } from 'axios';
import {
  fetchServices,
  fetchBranches,
  fetchAvailability,
  createBooking,
  type CheckAvailabilityParams,
  type CreateBookingPayload,
} from '@/api/booking.api';

export function usePublicServices() {
  return useQuery({
    queryKey: ['widget', 'services'],
    queryFn: fetchServices,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePublicBranches() {
  return useQuery({
    queryKey: ['widget', 'branches'],
    queryFn: fetchBranches,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePublicAvailability(params: CheckAvailabilityParams) {
  return useQuery({
    queryKey: ['widget', 'availability', params],
    queryFn: () => fetchAvailability(params),
    enabled: !!params.branchId && !!params.date,
    staleTime: 30 * 1000,
  });
}

export function useCreateBooking() {
  return useMutation({
    mutationFn: (payload: CreateBookingPayload) => createBooking(payload),
    onError: (error: unknown) => {
      const message =
        isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : error instanceof Error
            ? error.message
            : 'Failed to create booking';
      toast.error(message);
    },
  });
}
