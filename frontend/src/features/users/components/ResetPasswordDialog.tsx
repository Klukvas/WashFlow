import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useResetUserPassword } from '@/features/auth/hooks/useChangePassword';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'passwordMismatch',
  });

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

interface ResetPasswordDialogProps {
  open: boolean;
  userId: string | null;
  userName: string;
  onClose: () => void;
}

export function ResetPasswordDialog({
  open,
  userId,
  userName,
  onClose,
}: ResetPasswordDialogProps) {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation('common');
  const { mutate, isPending, error, reset: resetMutation } = useResetUserPassword();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  function handleClose() {
    reset();
    resetMutation();
    onClose();
  }

  function onSubmit(data: ResetPasswordFormData) {
    if (!userId) return;
    mutate(
      { userId, newPassword: data.newPassword },
      { onSuccess: handleClose },
    );
  }

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogHeader>
        <DialogTitle>
          {t('resetPassword.title', { name: userName })}
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('resetPassword.description', { name: userName })}
        </p>
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
          <p className="text-sm text-destructive">{t('resetPassword.error')}</p>
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
