import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';

const schema = z.object({
  name: z.string().trim().min(1, 'validation.nameRequired'),
  branchId: z.uuid('validation.branchRequired'),
});
export type WorkPostFormData = z.infer<typeof schema>;
export function WorkPostForm({
  branchId,
  branches = [],
  onSubmit,
  isPending,
  onCancel,
}: {
  branchId?: string;
  branches?: { id: string; name: string }[];
  onSubmit: (data: WorkPostFormData) => void;
  isPending?: boolean;
  onCancel?: () => void;
}) {
  const { t } = useTranslation('work-posts');
  const { t: tc } = useTranslation('common');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WorkPostFormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', branchId: branchId ?? '' },
  });
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {branchId ? (
        <input type="hidden" {...register('branchId')} />
      ) : (
        <div>
          <Label htmlFor="wp-branchId">{t('branch')}</Label>
          <Select
            id="wp-branchId"
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
            {...register('branchId')}
            error={errors.branchId?.message && t(errors.branchId.message)}
          />
        </div>
      )}
      <div>
        <Label htmlFor="wp-name">{t('name')}</Label>
        <Input
          id="wp-name"
          {...register('name')}
          error={errors.name?.message && t(errors.name.message)}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={onCancel}
          >
            {tc('actions.cancel')}
          </Button>
        )}
        <Button type="submit" loading={isPending}>
          {tc('actions.create')}
        </Button>
      </div>
    </form>
  );
}
