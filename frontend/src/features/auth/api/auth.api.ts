import { apiClient } from '@/shared/api/client';
import type { ApiResponse } from '@/shared/types/api';
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from '@/shared/types/auth';

export async function login(data: LoginRequest): Promise<AuthResponse> {
  const response = await apiClient.post<ApiResponse<AuthResponse>>(
    '/auth/login',
    data,
  );
  return response.data.data;
}

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const response = await apiClient.post<ApiResponse<AuthResponse>>(
    '/auth/register',
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

export async function forgotPassword(email: string): Promise<void> {
  await apiClient.post('/auth/forgot-password', { email });
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  await apiClient.post('/auth/reset-password', { token, newPassword });
}
