import { apiClient } from '@/shared/api/client';

export interface CreateSupportRequestPayload {
  subject: string;
  message: string;
}

export async function createSupportRequest(
  payload: CreateSupportRequestPayload,
): Promise<void> {
  await apiClient.post('/support', payload);
}
