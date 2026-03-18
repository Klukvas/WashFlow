import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  changePassword,
  resetUserPassword,
  type ChangePasswordPayload,
} from '../api/auth.api';

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: ChangePasswordPayload) => changePassword(data),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to change password');
    },
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ userId, newPassword }: { userId: string; newPassword: string }) =>
      resetUserPassword(userId, newPassword),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reset password');
    },
  });
}
