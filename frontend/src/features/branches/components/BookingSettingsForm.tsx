import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import type { BookingSettings } from '@/shared/types/models';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const bookingSettingsSchema = z.object({
  workingHoursStart: z.string().regex(timeRegex, 'validation.invalidTime'),
  workingHoursEnd: z.string().regex(timeRegex, 'validation.invalidTime'),
  slotDurationMinutes: z.coerce
    .number()
    .int()
    .min(5, 'validation.min5')
    .max(480, 'validation.max480'),
  bufferTimeMinutes: z.coerce
    .number()
    .int()
    .min(0, 'validation.min0')
    .max(120, 'validation.max120'),
  maxAdvanceBookingDays: z.coerce
    .number()
    .int()
    .min(1, 'validation.min1')
    .max(365, 'validation.max365'),
  allowOnlineBooking: z.boolean(),
  workingDays: z.array(z.number()).min(1, 'validation.atLeastOneDay'),
});

export type BookingSettingsFormData = z.infer<typeof bookingSettingsSchema>;

interface BookingSettingsFormProps {
  settings: BookingSettings | null;
  onSubmit: (data: BookingSettingsFormData) => void;
  isPending?: boolean;
  onCancel?: () => void;
}

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function BookingSettingsForm({
  settings,
  onSubmit,
  isPending,
  onCancel,
}: BookingSettingsFormProps) {
  const { t } = useTranslation('branches');
  const { t: tc } = useTranslation('common');

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<BookingSettingsFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(bookingSettingsSchema) as any,
    defaultValues: {
      workingHoursStart: settings?.workingHoursStart ?? '08:00',
      workingHoursEnd: settings?.workingHoursEnd ?? '20:00',
      slotDurationMinutes: settings?.slotDurationMinutes ?? 30,
      bufferTimeMinutes: settings?.bufferTimeMinutes ?? 10,
      maxAdvanceBookingDays: settings?.maxAdvanceBookingDays ?? 30,
      allowOnlineBooking: settings?.allowOnlineBooking ?? true,
      workingDays: settings?.workingDays ?? [1, 2, 3, 4, 5, 6],
    },
  });

  useEffect(() => {
    if (settings) {
      reset({
        workingHoursStart: settings.workingHoursStart,
        workingHoursEnd: settings.workingHoursEnd,
        slotDurationMinutes: settings.slotDurationMinutes,
        bufferTimeMinutes: settings.bufferTimeMinutes,
        maxAdvanceBookingDays: settings.maxAdvanceBookingDays,
        allowOnlineBooking: settings.allowOnlineBooking,
        workingDays: settings.workingDays,
      });
    }
  }, [settings, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="workingHoursStart">
            {t('bookingFields.workingHoursStart')}
          </Label>
          <Input
            id="workingHoursStart"
            type="time"
            error={
              errors.workingHoursStart?.message
                ? t(errors.workingHoursStart.message)
                : undefined
            }
            {...register('workingHoursStart')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="workingHoursEnd">
            {t('bookingFields.workingHoursEnd')}
          </Label>
          <Input
            id="workingHoursEnd"
            type="time"
            error={
              errors.workingHoursEnd?.message
                ? t(errors.workingHoursEnd.message)
                : undefined
            }
            {...register('workingHoursEnd')}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="slotDurationMinutes">
            {t('bookingFields.slotDurationMinutes')}
          </Label>
          <Input
            id="slotDurationMinutes"
            type="number"
            min={5}
            max={480}
            error={
              errors.slotDurationMinutes?.message
                ? t(errors.slotDurationMinutes.message)
                : undefined
            }
            {...register('slotDurationMinutes')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bufferTimeMinutes">
            {t('bookingFields.bufferTimeMinutes')}
          </Label>
          <Input
            id="bufferTimeMinutes"
            type="number"
            min={0}
            max={120}
            error={
              errors.bufferTimeMinutes?.message
                ? t(errors.bufferTimeMinutes.message)
                : undefined
            }
            {...register('bufferTimeMinutes')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxAdvanceBookingDays">
            {t('bookingFields.maxAdvanceBookingDays')}
          </Label>
          <Input
            id="maxAdvanceBookingDays"
            type="number"
            min={1}
            max={365}
            error={
              errors.maxAdvanceBookingDays?.message
                ? t(errors.maxAdvanceBookingDays.message)
                : undefined
            }
            {...register('maxAdvanceBookingDays')}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('bookingFields.workingDays')}</Label>
        <Controller
          name="workingDays"
          control={control}
          render={({ field }) => (
            <div className="flex flex-wrap gap-2">
              {ALL_DAYS.map((day, idx) => {
                const isSelected = field.value.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent'
                    }`}
                    onClick={() => {
                      const next = isSelected
                        ? field.value.filter((d) => d !== day)
                        : [...field.value, day];
                      field.onChange(next);
                    }}
                  >
                    {t(`days.${DAY_KEYS[idx]}`)}
                  </button>
                );
              })}
            </div>
          )}
        />
        {errors.workingDays?.message && (
          <p className="text-sm text-destructive">
            {t(errors.workingDays.message)}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <Label htmlFor="allowOnlineBooking" className="cursor-pointer">
          {t('bookingFields.allowOnlineBooking')}
        </Label>
        <Controller
          name="allowOnlineBooking"
          control={control}
          render={({ field }) => (
            <Switch
              id="allowOnlineBooking"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            {tc('actions.cancel')}
          </Button>
        )}
        <Button type="submit" loading={isPending} disabled={!isDirty}>
          {tc('actions.save')}
        </Button>
      </div>
    </form>
  );
}
