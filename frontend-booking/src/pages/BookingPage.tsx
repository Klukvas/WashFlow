import { useState, useId, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Check,
  CalendarPlus,
  Printer,
  Loader2,
  Phone,
  MapPin,
  Wrench,
  Calendar,
  User,
} from 'lucide-react';
import type { Order } from '@/types/models';
import {
  usePublicServices,
  usePublicBranches,
  usePublicAvailability,
  useCreateBooking,
} from '@/hooks/usePublicBooking';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { CalendarGrid } from '@/ui/date-picker';
import { Label } from '@/ui/label';
import { Select } from '@/ui/select';
import { Skeleton } from '@/ui/skeleton';
import { formatCurrency, formatDuration, formatTime } from '@/utils/format';
import { cn } from '@/utils/cn';

const bookingSchema = z.object({
  branchId: z.string().uuid(),
  scheduledStart: z.string().min(1),
  serviceIds: z.array(z.string().uuid()).min(1),
  firstName: z.string().min(1),
  lastName: z.string().optional().or(z.literal('')),
  phone: z.string().regex(/^\+?[\d\s\-()]{7,20}$/),
  email: z.string().email().optional().or(z.literal('')),
  licensePlate: z.string().min(1),
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  notes: z.string().optional(),
});

type BookingForm = z.infer<typeof bookingSchema>;

export function BookingPage() {
  const { t } = useTranslation('public-booking');
  const formId = useId();
  const [step, setStep] = useState(0);
  const [selectedDate, setSelectedDate] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  const {
    data: branches,
    isLoading: branchesLoading,
    isError: branchesError,
  } = usePublicBranches();
  const {
    data: services,
    isLoading: servicesLoading,
    isError: servicesError,
  } = usePublicServices();
  const { mutate: book, isPending } = useCreateBooking();

  const {
    register,
    setValue,
    watch,
    trigger,
    handleSubmit,
    formState: { errors },
  } = useForm<BookingForm>({
    resolver: zodResolver(bookingSchema),
    defaultValues: { serviceIds: [] },
    mode: 'onTouched',
  });

  const branchId = watch('branchId');
  const selectedServiceIds = watch('serviceIds');
  const hasSingleBranch = branches && branches.length === 1;

  // Auto-select branch if only one exists
  useEffect(() => {
    if (hasSingleBranch && !branchId) {
      setValue('branchId', branches[0].id, { shouldValidate: true });
    }
  }, [hasSingleBranch, branchId, branches, setValue]);

  const totalDuration = (services ?? [])
    .filter((s) => selectedServiceIds.includes(s.id))
    .reduce((sum, s) => sum + s.durationMin, 0);

  const totalPrice = (services ?? [])
    .filter((s) => selectedServiceIds.includes(s.id))
    .reduce((sum, s) => sum + Number(s.price), 0);

  const { data: rawSlots, isFetching: slotsFetching } = usePublicAvailability({
    branchId,
    date: selectedDate,
    durationMinutes: totalDuration || undefined,
  });

  // Recompute `now` each time rawSlots or selectedDate changes
  // to avoid showing already-past slots as available
  const slots = useMemo(() => {
    if (!rawSlots) return undefined;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    return Array.from(
      rawSlots
        .filter(
          (s) =>
            s.available &&
            (selectedDate !== todayStr || new Date(s.start) > now),
        )
        .reduce(
          (map, s) => (map.has(s.start) ? map : map.set(s.start, s)),
          new Map<string, (typeof rawSlots)[number]>(),
        )
        .values(),
    );
  }, [rawSlots, selectedDate]);

  function toggleService(id: string) {
    const current = selectedServiceIds;
    setValue(
      'serviceIds',
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
      { shouldValidate: true },
    );
  }

  const onSubmit = (data: BookingForm) => {
    book(
      {
        ...data,
        email: data.email || undefined,
        lastName: data.lastName || undefined,
      },
      { onSuccess: (order) => setConfirmedOrder(order) },
    );
  };

  if (branchesError || servicesError) {
    return (
      <div className="py-12 text-center">
        <p className="text-lg text-destructive">{t('loadError')}</p>
        <button
          className="mt-4 text-sm text-primary underline"
          onClick={() => window.location.reload()}
        >
          {t('retryButton')}
        </button>
      </div>
    );
  }

  if (branchesLoading || servicesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-full max-w-xs" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  // --- Confirmation page ---
  if (confirmedOrder) {
    const order = confirmedOrder;
    const branch = branches?.find((b) => b.id === order.branchId);
    const branchName = order.branch?.name ?? branch?.name ?? '';
    const branchAddress = order.branch?.address ?? branch?.address ?? '';
    const branchPhone = branch?.phone ?? '';
    const customerName = [order.client?.firstName, order.client?.lastName]
      .filter(Boolean)
      .join(' ');
    const orderServices = order.services ?? [];
    const orderTotal = Number(order.totalPrice);
    const orderDuration = orderServices.reduce(
      (sum, s) => sum + s.service.durationMin,
      0,
    );
    const orderShortId = order.id.slice(0, 8).toUpperCase();

    const toGCalDate = (iso: string) =>
      iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const calTitle = t('calendarEventTitle', { branch: branchName });
    const calDetails = [
      customerName,
      order.vehicle?.licensePlate,
      orderServices.map((s) => s.service.name).join(', '),
      `${t('totalLabel')}: ${formatCurrency(orderTotal)}`,
    ]
      .filter(Boolean)
      .join('\n');
    const gcalUrl = `https://calendar.google.com/calendar/r/eventedit?${new URLSearchParams(
      {
        text: calTitle,
        dates: `${toGCalDate(order.scheduledStart)}/${toGCalDate(order.scheduledEnd)}`,
        location: branchAddress,
        details: calDetails,
      },
    ).toString()}`;

    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="py-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <Check className="h-8 w-8 text-success" />
            </div>
            <h2 className="mb-1 text-xl font-bold">{t('confirmedTitle')}</h2>
            <p className="mb-2 font-mono text-sm font-semibold text-primary">
              {t('orderNumber', { id: orderShortId })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('confirmedMessage')}
            </p>
          </div>

          <div className="space-y-3 rounded-md bg-muted/50 p-4">
            <p className="text-sm font-semibold">{t('bookingDetails')}</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('location')}</span>
              <span className="font-medium">{branchName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('dateAndTime')}</span>
              <span className="font-medium">
                {order.scheduledStart.split('T')[0]} {t('at')}{' '}
                {formatTime(order.scheduledStart)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('duration')}</span>
              <span className="font-medium">
                {formatDuration(orderDuration)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('name')}</span>
              <span className="font-medium">{customerName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('phone2')}</span>
              <span className="font-medium">{order.client?.phone}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('vehicle')}</span>
              <span className="font-medium">{order.vehicle?.licensePlate}</span>
            </div>
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-sm font-medium">{t('services')}:</p>
              {orderServices.map((s) => (
                <div key={s.id} className="flex justify-between text-sm">
                  <span>
                    {s.service.name} ({formatDuration(s.service.durationMin)})
                  </span>
                  <span>{formatCurrency(Number(s.price))}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-border pt-3 text-lg font-bold">
              <span>{t('totalLabel')}</span>
              <span>{formatCurrency(orderTotal)}</span>
            </div>
          </div>

          {/* Next steps */}
          <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-4">
            <p className="mb-1 text-sm font-semibold">{t('nextSteps')}</p>
            <p className="text-sm text-muted-foreground">
              {t('nextStepsMessage')}
            </p>
          </div>

          {/* Branch contact */}
          {(branchAddress || branchPhone) && (
            <div className="mt-4 space-y-1.5 rounded-md bg-muted/50 p-4">
              <p className="text-sm font-semibold">{t('branchContact')}</p>
              {branchAddress && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span>{branchAddress}</span>
                </div>
              )}
              {branchPhone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <a href={`tel:${branchPhone}`} className="underline">
                    {branchPhone}
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <a
              href={gcalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent"
            >
              <CalendarPlus className="h-4 w-4" />
              {t('addToGoogleCalendar')}
            </a>
            <button
              onClick={() => window.print()}
              className="flex flex-1 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent"
            >
              <Printer className="h-4 w-4" />
              {t('printConfirmation')}
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Steps ---
  const steps = [
    { label: t('steps.services'), icon: Wrench },
    { label: t('steps.yourInfo'), icon: User },
    { label: t('steps.confirm'), icon: Check },
  ];

  const fieldId = (name: string) => `${formId}-${name}`;

  const canProceedStep0 =
    !!branchId && selectedServiceIds.length > 0 && !!watch('scheduledStart');

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="mb-3 flex justify-between">
          {steps.map((s, i) => (
            <div
              key={s.label}
              className="flex flex-1 flex-col items-center gap-1"
            >
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                  i < step
                    ? 'bg-success text-success-foreground'
                    : i === step
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                )}
                aria-current={i === step ? 'step' : undefined}
              >
                {i < step ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <s.icon className="h-5 w-5" />
                )}
              </div>
              <span
                className={cn(
                  'text-center text-xs sm:text-sm',
                  i === step ? 'font-semibold' : 'text-muted-foreground',
                )}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
        <div className="relative h-1 rounded-full bg-muted">
          <div
            className="absolute left-0 top-0 h-1 rounded-full bg-primary transition-all duration-300"
            style={{ width: `${(step / (steps.length - 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Step 0: Branch + Services + Date/Time */}
      {step === 0 && (
        <div className="space-y-6">
          {/* Branch selector — hidden if single branch */}
          {!hasSingleBranch && (
            <Card>
              <CardContent className="p-6">
                <Label htmlFor={fieldId('branch')}>{t('selectLocation')}</Label>
                <Select
                  id={fieldId('branch')}
                  options={(branches ?? []).map((b) => ({
                    value: b.id,
                    label: b.name,
                  }))}
                  placeholder={t('chooseLocation')}
                  value={branchId ?? ''}
                  onChange={(e) =>
                    setValue('branchId', e.target.value, {
                      shouldValidate: true,
                    })
                  }
                />
              </CardContent>
            </Card>
          )}

          {/* Services */}
          <Card>
            <CardContent className="p-6">
              <CardHeader className="p-0 pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  {t('selectServices')}
                </CardTitle>
              </CardHeader>
              <div
                className="space-y-2"
                role="group"
                aria-label={t('selectServices')}
              >
                {(services ?? []).map((s) => {
                  const isSelected = selectedServiceIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md border-2 p-4 text-left transition-colors hover:bg-accent',
                        isSelected
                          ? 'border-primary bg-primary/10'
                          : 'border-transparent bg-card',
                      )}
                      onClick={() => toggleService(s.id)}
                    >
                      <div>
                        <p className="font-medium">{s.name}</p>
                        {s.description && (
                          <p className="text-sm text-muted-foreground">
                            {s.description}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {formatDuration(s.durationMin)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">
                          {formatCurrency(Number(s.price))}
                        </span>
                        <div
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted-foreground/30',
                          )}
                        >
                          {isSelected && <Check className="h-4 w-4" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedServiceIds.length > 0 && (
                <div className="mt-4 flex justify-between rounded-md bg-muted p-4 font-semibold">
                  <span>
                    {t('total')} {formatDuration(totalDuration)}
                  </span>
                  <span>{formatCurrency(totalPrice)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Date & Time */}
          <Card>
            <CardContent className="p-6">
              <CardHeader className="p-0 pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {t('chooseDateAndTime')}
                </CardTitle>
              </CardHeader>
              <CalendarGrid
                value={selectedDate}
                onChange={setSelectedDate}
                min={new Date().toISOString().split('T')[0]}
                className="mx-auto border-0 p-0"
              />
              {/* Slots loading */}
              {selectedDate && slotsFetching && (
                <div className="mt-4 flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('loadingSlots')}
                </div>
              )}
              {/* Slots grid */}
              {selectedDate && !slotsFetching && slots && slots.length > 0 && (
                <div
                  className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4"
                  role="radiogroup"
                  aria-label={t('chooseDateAndTime')}
                >
                  {slots.map((slot) => (
                    <button
                      key={slot.start}
                      type="button"
                      role="radio"
                      aria-checked={watch('scheduledStart') === slot.start}
                      className={cn(
                        'min-h-[44px] rounded-md border px-3 py-2.5 text-center text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        watch('scheduledStart') === slot.start
                          ? 'border-primary bg-primary text-primary-foreground font-semibold'
                          : 'border-input',
                      )}
                      onClick={() =>
                        setValue('scheduledStart', slot.start, {
                          shouldValidate: true,
                        })
                      }
                    >
                      {formatTime(slot.start)}
                    </button>
                  ))}
                </div>
              )}
              {/* No slots */}
              {selectedDate &&
                !slotsFetching &&
                slots &&
                slots.length === 0 && (
                  <div className="mt-4 rounded-md bg-muted/50 py-6 text-center">
                    <p className="font-medium text-muted-foreground">
                      {t('noSlots')}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground/70">
                      {t('noSlotsHint')}
                    </p>
                  </div>
                )}
            </CardContent>
          </Card>

          {/* Continue */}
          <Button
            onClick={() => setStep(1)}
            disabled={!canProceedStep0}
            className="w-full"
            size="lg"
          >
            {t('continueButton')}
          </Button>
        </div>
      )}

      {/* Step 1: Contact Info */}
      {step === 1 && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <CardHeader className="p-0">
              <CardTitle>{t('yourInformation')}</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={fieldId('firstName')}>
                  {t('firstName')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={fieldId('firstName')}
                  {...register('firstName')}
                  error={errors.firstName ? t('required') : undefined}
                />
              </div>
              <div>
                <Label htmlFor={fieldId('lastName')}>
                  {t('lastName')}{' '}
                  <span className="text-xs text-muted-foreground">
                    ({t('optional')})
                  </span>
                </Label>
                <Input id={fieldId('lastName')} {...register('lastName')} />
              </div>
              <div>
                <Label htmlFor={fieldId('phone')}>
                  {t('phone')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={fieldId('phone')}
                  type="tel"
                  placeholder={t('phonePlaceholder')}
                  {...register('phone')}
                  error={errors.phone ? t('phoneError') : undefined}
                />
              </div>
              <div>
                <Label htmlFor={fieldId('email')}>
                  {t('email')}{' '}
                  <span className="text-xs text-muted-foreground">
                    ({t('optional')})
                  </span>
                </Label>
                <Input
                  id={fieldId('email')}
                  type="email"
                  {...register('email')}
                  error={errors.email?.message}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor={fieldId('licensePlate')}>
                  {t('licensePlate')}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={fieldId('licensePlate')}
                  placeholder={t('licensePlatePlaceholder')}
                  {...register('licensePlate')}
                  error={errors.licensePlate ? t('required') : undefined}
                />
              </div>
              <div>
                <Label htmlFor={fieldId('vehicleMake')}>
                  {t('vehicleMake')}{' '}
                  <span className="text-xs text-muted-foreground">
                    ({t('optional')})
                  </span>
                </Label>
                <Input
                  id={fieldId('vehicleMake')}
                  placeholder={t('vehicleMakePlaceholder')}
                  {...register('vehicleMake')}
                />
              </div>
              <div>
                <Label htmlFor={fieldId('vehicleModel')}>
                  {t('vehicleModel')}{' '}
                  <span className="text-xs text-muted-foreground">
                    ({t('optional')})
                  </span>
                </Label>
                <Input
                  id={fieldId('vehicleModel')}
                  {...register('vehicleModel')}
                />
              </div>
            </div>
            <div>
              <Label htmlFor={fieldId('notes')}>
                {t('notes')}{' '}
                <span className="text-xs text-muted-foreground">
                  ({t('optional')})
                </span>
              </Label>
              <Input
                id={fieldId('notes')}
                {...register('notes')}
                placeholder={t('notesPlaceholder')}
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(0)}
                className="flex-1"
              >
                {t('backButton')}
              </Button>
              <Button
                onClick={async () => {
                  const valid = await trigger([
                    'firstName',
                    'phone',
                    'licensePlate',
                  ]);
                  if (valid) setStep(2);
                }}
                className="flex-1"
              >
                {t('reviewBooking')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Review + Confirm */}
      {step === 2 && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <CardHeader className="p-0">
              <CardTitle>{t('reviewTitle')}</CardTitle>
            </CardHeader>
            <div className="space-y-3 rounded-md bg-muted/50 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('location')}</span>
                <span className="font-medium">
                  {branches?.find((b) => b.id === branchId)?.name}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {t('dateAndTime')}
                </span>
                <span className="font-medium">
                  {selectedDate} {t('at')}{' '}
                  {watch('scheduledStart')
                    ? formatTime(watch('scheduledStart'))
                    : ''}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('name')}</span>
                <span className="font-medium">
                  {[watch('firstName'), watch('lastName')]
                    .filter(Boolean)
                    .join(' ')}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('phone2')}</span>
                <span className="font-medium">{watch('phone')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('vehicle')}</span>
                <span className="font-medium">{watch('licensePlate')}</span>
              </div>
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-sm font-medium">{t('services')}:</p>
                {(services ?? [])
                  .filter((s) => selectedServiceIds.includes(s.id))
                  .map((s) => (
                    <div key={s.id} className="flex justify-between text-sm">
                      <span>
                        {s.name} ({formatDuration(s.durationMin)})
                      </span>
                      <span>{formatCurrency(Number(s.price))}</span>
                    </div>
                  ))}
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-lg font-bold">
                <span>{t('totalLabel')}</span>
                <span>{formatCurrency(totalPrice)}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="flex-1"
              >
                {t('backButton')}
              </Button>
              <Button
                onClick={handleSubmit(onSubmit)}
                loading={isPending}
                className="flex-1"
              >
                {t('confirmBooking')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
