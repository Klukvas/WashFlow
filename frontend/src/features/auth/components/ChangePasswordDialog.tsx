import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useChangePassword } from '../hooks/useChangePassword';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'passwordMismatch',
  });

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation('common');
  const { mutate, isPending, error, reset: resetMutation } = useChangePassword();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
  });

  function handleClose() {
    reset();
    resetMutation();
    onClose();
  }

  function onSubmit(data: ChangePasswordFormData) {
    mutate(
      { currentPassword: data.currentPassword, newPassword: data.newPassword },
      { onSuccess: handleClose },
    );
  }

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogHeader>
        <DialogTitle>{t('changePassword.title')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">{t('changePassword.currentPassword')}</Label>
          <Input
            id="currentPassword"
            type="password"
            error={errors.currentPassword?.message}
            {...register('currentPassword')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword">{t('changePassword.newPassword')}</Label>
          <Input
            id="newPassword"
            type="password"
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{t('changePassword.confirmPassword')}</Label>
          <Input
            id="confirmPassword"
            type="password"
            error={
              errors.confirmPassword?.message === 'passwordMismatch'
                ? t('changePassword.passwordMismatch')
                : errors.confirmPassword?.message
            }
            {...register('confirmPassword')}
          />
        </div>
        {error && (
          <p className="text-sm text-destructive">{t('changePassword.error')}</p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {tc('actions.save')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
