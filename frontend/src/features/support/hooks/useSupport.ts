import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  createSupportRequest,
  type CreateSupportRequestPayload,
} from '../api/support.api';

export function useCreateSupportRequest() {
  const { t } = useTranslation('common');

  return useMutation({
    mutationFn: (payload: CreateSupportRequestPayload) =>
      createSupportRequest(payload),
    onSuccess: () => {
      toast.success(t('support.successMessage'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('support.errorMessage'));
    },
  });
}
