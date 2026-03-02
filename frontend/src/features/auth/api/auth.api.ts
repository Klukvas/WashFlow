import { apiClient } from '@/shared/api/client';
import type { ApiResponse } from '@/shared/types/api';
import type {
  AuthResponse,
  LoginRequest,
  RefreshRequest,
} from '@/shared/types/auth';

export async function login(data: LoginRequest): Promise<AuthResponse> {
  const response = await apiClient.post<ApiResponse<AuthResponse>>(
    '/auth/login',
    data,
  );
  return response.data.data;
}

export async function refreshTokens(
  data: RefreshRequest,
): Promise<AuthResponse> {
  const response = await apiClient.post<ApiResponse<AuthResponse>>(
    '/auth/refresh',
    data,
  );
  return response.data.data;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export async function changePassword(
  data: ChangePasswordPayload,
): Promise<void> {
  await apiClient.patch('/auth/change-password', data);
}

export async function resetUserPassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  await apiClient.patch(`/users/${userId}/reset-password`, { newPassword });
}
