import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { register } from '../api/auth.api';
import { useAuthStore } from '@/shared/stores/auth.store';
import type { RegisterRequest } from '@/shared/types/auth';

export function useRegister() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: (data: RegisterRequest) => register(data),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user);
      navigate('/dashboard', { replace: true });
    },
  });
}
