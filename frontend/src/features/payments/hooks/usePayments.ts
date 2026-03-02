import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPayments, createPayment, type CreatePaymentPayload } from '../api/payments.api';

export function usePayments(orderId: string) {
  return useQuery({
    queryKey: ['payments', orderId],
    queryFn: () => fetchPayments(orderId),
    enabled: !!orderId,
  });
}

export function useCreatePayment(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePaymentPayload) => createPayment(orderId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
