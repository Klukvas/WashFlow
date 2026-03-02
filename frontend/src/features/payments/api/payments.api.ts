import { apiClient, withIdempotencyKey } from '@/shared/api/client';
import type { ApiResponse } from '@/shared/types/api';
import type { Payment } from '@/shared/types/models';
import type { PaymentMethod } from '@/shared/types/enums';

export interface CreatePaymentPayload {
  amount: number;
  method: PaymentMethod;
  reference?: string;
}

export async function fetchPayments(orderId: string): Promise<Payment[]> {
  const { data } = await apiClient.get<ApiResponse<Payment[]>>(
    `/orders/${orderId}/payments`,
  );
  return data.data;
}

export async function createPayment(
  orderId: string,
  payload: CreatePaymentPayload,
): Promise<Payment> {
  const { data } = await apiClient.post<ApiResponse<Payment>>(
    `/orders/${orderId}/payments`,
    payload,
    withIdempotencyKey(),
  );
  return data.data;
}
