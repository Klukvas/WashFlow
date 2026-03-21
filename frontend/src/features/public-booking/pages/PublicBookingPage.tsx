import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Calendar, Wrench, User, CalendarPlus } from 'lucide-react';
import type { Order } from '@/shared/types/models';
import {
  usePublicServices,
  usePublicBranches,
  usePublicAvailability,
  useCreateBooking,
} from '../hooks/usePublicBooking';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { CalendarGrid } from '@/shared/ui/date-picker';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';
import {
  formatCurrency,
  formatDuration,
  formatTime,
} from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';

const bookingSchema = z.object({
  branchId: z.string().uuid(),
  scheduledStart: z.string().min(1),
  serviceIds: z.array(z.string().uuid()).min(1),
  firstName: z.string().min(1),
  lastName: z.string().optional().or(z.literal('')),
  phone: z.string().regex(/^\+?[\d\s\-()]{7,20}$/, 'Invalid phone format'),
  email: z.string().email().optional().or(z.literal('')),
  licensePlate: z.string().min(1, 'License plate is required'),
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  notes: z.string().optional(),
});

type BookingForm = z.infer<typeof bookingSchema>;

export function PublicBookingPage() {
  const { t } = useTranslation('public-booking');
  const { slug } = useParams<{ slug: string }>();
  const [step, setStep] = useState(0);
  const [selectedDate, setSelectedDate] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  const tenantSlug = slug ?? '';

  const {
    data: branches,
    isLoading: branchesLoading,
    isError: branchesError,
  } = usePublicBranches(tenantSlug);
  const {
    data: services,
    isLoading: servicesLoading,
    isError: servicesError,
  } = usePublicServices(tenantSlug);
  const { mutate: book, isPending } = useCreateBooking(tenantSlug);

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
  });

  const branchId = watch('branchId');
  const selectedServiceIds = watch('serviceIds');

  const totalDuration = (services ?? [])
    .filter((s) => selectedServiceIds.includes(s.id))
    .reduce((sum, s) => sum + s.durationMin, 0);

  const totalPrice = (services ?? [])
    .filter((s) => selectedServiceIds.includes(s.id))
    .reduce((sum, s) => sum + Number(s.price), 0);

  const { data: rawSlots } = usePublicAvailability(tenantSlug, {
    branchId,
    date: selectedDate,
    durationMinutes: totalDuration || undefined,
  });

  // Deduplicate slots by start time — public booking auto-assigns work post
  const slots = rawSlots
    ? Array.from(
        rawSlots
          .filter((s) => s.available)
          .reduce(
            (map, s) => (map.has(s.start) ? map : map.set(s.start, s)),
            new Map<string, (typeof rawSlots)[number]>(),
          )
          .values(),
      )
    : undefined;

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
        <p className="text-lg text-destructive">
          Failed to load. Please try again later.
        </p>
        <button
          className="mt-4 text-sm text-primary underline"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (branchesLoading || servicesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (confirmedOrder) {
    const order = confirmedOrder;
    const branchName = order.branch?.name ?? '';
    const branchAddress = order.branch?.address ?? '';
    const customerName = [order.client?.firstName, order.client?.lastName]
      .filter(Boolean)
      .join(' ');
    const orderServices = order.services ?? [];
    const orderTotal = Number(order.totalPrice);
    const orderDuration = orderServices.reduce(
      (sum, s) => sum + (s.service.durationMin ?? 0),
      0,
    );

    // Build Google Calendar URL
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
            <h2 className="mb-2 text-xl font-bold">{t('confirmedTitle')}</h2>
            <p className="text-muted-foreground">{t('confirmedMessage')}</p>
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
              <span className="text-muted-foreground">{t('phone')}</span>
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

          <a
            href={gcalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent"
          >
            <CalendarPlus className="h-4 w-4" />
            {t('addToGoogleCalendar')}
          </a>
        </CardContent>
      </Card>
    );
  }

  const steps = [
    { label: t('steps.services'), icon: Wrench },
    { label: t('steps.schedule'), icon: Calendar },
    { label: t('steps.yourInfo'), icon: User },
    { label: t('steps.confirm'), icon: Check },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>

      {/* Steps */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                i < step
                  ? 'bg-success text-success-foreground'
                  : i === step
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {i < step ? (
                <Check className="h-5 w-5" />
              ) : (
                <s.icon className="h-5 w-5" />
              )}
            </div>
            <span
              className={cn(
                'hidden text-sm sm:inline',
                i === step && 'font-semibold',
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className="h-px w-6 bg-border sm:w-12" />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          {/* Step 0: Branch + Services */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label>{t('selectLocation')}</Label>
                <Select
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
              </div>
              <div>
                <Label>{t('selectServices')}</Label>
                <div className="mt-2 space-y-2">
                  {(services ?? []).map((s) => (
                    <button
                      key={s.id}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md border p-4 text-left hover:bg-accent',
                        selectedServiceIds.includes(s.id) &&
                          'border-primary bg-primary/10',
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
                        {selectedServiceIds.includes(s.id) && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              {selectedServiceIds.length > 0 && (
                <div className="flex justify-between rounded-md bg-muted p-4 font-semibold">
                  <span>
                    {t('total')}: {formatDuration(totalDuration)}
                  </span>
                  <span>{formatCurrency(totalPrice)}</span>
                </div>
              )}
              <Button
                onClick={() => setStep(1)}
                disabled={!branchId || selectedServiceIds.length === 0}
                className="w-full"
              >
                {t('continueButton')}
              </Button>
            </div>
          )}

          {/* Step 1: Date/Time */}
          {step === 1 && (
            <div className="space-y-4">
              <CardHeader className="p-0">
                <CardTitle>{t('chooseDateAndTime')}</CardTitle>
              </CardHeader>
              <CalendarGrid
                value={selectedDate}
                onChange={setSelectedDate}
                min={new Date().toISOString().split('T')[0]}
                className="mx-auto w-full max-w-sm border-0 p-0"
              />
              {selectedDate && slots && slots.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((slot) => (
                    <button
                      key={slot.start}
                      className={cn(
                        'rounded-md border px-3 py-2 text-center text-sm hover:bg-accent',
                        // eslint-disable-next-line react-hooks/incompatible-library -- React Hook Form watch() is incompatible with React Compiler memoization
                        watch('scheduledStart') === slot.start &&
                          'border-primary bg-primary/10 font-semibold',
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
              {selectedDate && slots && slots.length === 0 && (
                <p className="text-center text-muted-foreground">
                  {t('noSlots')}
                </p>
              )}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(0)}
                  className="flex-1"
                >
                  {t('backButton')}
                </Button>
                <Button
                  onClick={() => setStep(2)}
                  disabled={!watch('scheduledStart')}
                  className="flex-1"
                >
                  {t('continueButton')}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Contact Info */}
          {step === 2 && (
            <div className="space-y-4">
              <CardHeader className="p-0">
                <CardTitle>{t('yourInformation')}</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>{t('firstName')}</Label>
                  <Input
                    {...register('firstName')}
                    error={errors.firstName?.message}
                  />
                </div>
                <div>
                  <Label>{t('lastName')}</Label>
                  <Input
                    {...register('lastName')}
                    placeholder={t('optionalPlaceholder')}
                  />
                </div>
                <div>
                  <Label>{t('phone')}</Label>
                  <Input
                    type="tel"
                    {...register('phone')}
                    error={errors.phone?.message}
                  />
                </div>
                <div>
                  <Label>{t('email')}</Label>
                  <Input
                    type="email"
                    {...register('email')}
                    placeholder={t('optionalPlaceholder')}
                    error={errors.email?.message}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <Label>{t('licensePlate')}</Label>
                  <Input
                    {...register('licensePlate')}
                    error={errors.licensePlate?.message}
                  />
                </div>
                <div>
                  <Label>{t('vehicleMake')}</Label>
                  <Input {...register('vehicleMake')} />
                </div>
                <div>
                  <Label>{t('vehicleModel')}</Label>
                  <Input
                    {...register('vehicleModel')}
                    placeholder={t('optionalPlaceholder')}
                  />
                </div>
              </div>
              <div>
                <Label>{t('notes')}</Label>
                <Input
                  {...register('notes')}
                  placeholder={t('notesPlaceholder')}
                />
              </div>
              {/* reCAPTCHA placeholder */}
              <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                {t('recaptchaPlaceholder')}
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
                  onClick={async () => {
                    const valid = await trigger([
                      'firstName',
                      'phone',
                      'licensePlate',
                    ]);
                    if (valid) setStep(3);
                  }}
                  className="flex-1"
                >
                  {t('reviewBooking')}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
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
                  <span className="text-muted-foreground">{t('phone')}</span>
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
                  onClick={() => setStep(2)}
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
