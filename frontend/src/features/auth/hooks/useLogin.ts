import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { login } from '../api/auth.api';
import { useAuthStore } from '@/shared/stores/auth.store';
import type { LoginRequest } from '@/shared/types/auth';

export function useLogin() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: (data: LoginRequest) => login(data),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user);
      navigate('/dashboard', { replace: true });
    },
    onError: (error: Error) => {
      toast.error(
        error.message || 'Login failed. Please check your credentials.',
      );
    },
  });
}
