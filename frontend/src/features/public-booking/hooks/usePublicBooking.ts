import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchPublicServices,
  fetchPublicBranches,
  fetchPublicAvailability,
  createPublicBooking,
  type CheckAvailabilityParams,
  type CreateBookingPayload,
} from '../api/booking.api';

export function usePublicServices(slug: string) {
  return useQuery({
    queryKey: ['public', slug, 'services'],
    queryFn: () => fetchPublicServices(slug),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePublicBranches(slug: string) {
  return useQuery({
    queryKey: ['public', slug, 'branches'],
    queryFn: () => fetchPublicBranches(slug),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePublicAvailability(slug: string, params: CheckAvailabilityParams) {
  return useQuery({
    queryKey: ['public', slug, 'availability', params],
    queryFn: () => fetchPublicAvailability(slug, params),
    enabled: !!slug && !!params.branchId && !!params.date,
    staleTime: 10 * 1000,
  });
}

export function useCreateBooking(slug: string) {
  return useMutation({
    mutationFn: (payload: CreateBookingPayload) => createPublicBooking(slug, payload),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create booking');
    },
  });
}
