import { useMutation } from '@tanstack/react-query';
import {
  changePassword,
  resetUserPassword,
  type ChangePasswordPayload,
} from '../api/auth.api';

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: ChangePasswordPayload) => changePassword(data),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ userId, newPassword }: { userId: string; newPassword: string }) =>
      resetUserPassword(userId, newPassword),
  });
}
