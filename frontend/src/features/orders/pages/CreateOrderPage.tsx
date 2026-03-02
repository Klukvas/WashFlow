import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm as useHookForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Check, Plus } from 'lucide-react';
import { useCreateOrder, useAvailability } from '../hooks/useOrders';
import { useCreateClient } from '@/features/clients/hooks/useClients';
import { useCreateVehicle } from '@/features/vehicles/hooks/useVehicles';
import {
  ClientForm,
  type ClientFormValues,
} from '@/features/clients/components/ClientForm';
import { apiClient } from '@/shared/api/client';
import type { PaginatedApiResponse } from '@/shared/types/api';
import type {
  Client,
  Vehicle,
  Service,
  Branch,
  WorkPost,
  EmployeeProfile,
} from '@/shared/types/models';
import { fetchProfiles } from '@/features/workforce/api/workforce.api';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatTime,
} from '@/shared/utils/format';
import { DatePicker } from '@/shared/ui/date-picker';
import { cn } from '@/shared/utils/cn';

const vehicleSchema = z.object({
  make: z.string().min(1, 'required'),
  licensePlate: z.string().optional().or(z.literal('')),
  model: z.string().optional().or(z.literal('')),
  color: z.string().optional().or(z.literal('')),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
});

type VehicleFormValues = z.infer<typeof vehicleSchema>;

const createOrderSchema = z.object({
  branchId: z.string().uuid(),
  clientId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  workPostId: z.string().uuid().optional(),
  assignedEmployeeId: z.string().uuid().optional(),
  scheduledStart: z.string().min(1),
  serviceIds: z.array(z.string().uuid()).min(1),
  notes: z.string().optional(),
});

type CreateOrderForm = z.infer<typeof createOrderSchema>;

export function CreateOrderPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');
  const [step, setStep] = useState(0);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedWorkPostId, setSelectedWorkPostId] = useState('');
  const { mutate: createOrderMut, isPending } = useCreateOrder();

  // Quick-create dialog state
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [createdClient, setCreatedClient] = useState<Client | null>(null);
  const [createdVehicle, setCreatedVehicle] = useState<Vehicle | null>(null);

  const { mutate: createClientMut, isPending: isCreatingClient } =
    useCreateClient();
  const { mutate: createVehicleMut, isPending: isCreatingVehicle } =
    useCreateVehicle();

  const {
    setValue,
    watch,
    handleSubmit,
    formState: { errors },
  } = useHookForm<CreateOrderForm>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: { serviceIds: [] },
  });

  // Vehicle quick-create form
  const {
    register: registerVehicle,
    handleSubmit: handleVehicleSubmit,
    reset: resetVehicleForm,
    formState: { errors: vehicleErrors },
  } = useHookForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema) as never,
  });

  const branchId = watch('branchId');
  const clientId = watch('clientId');
  const selectedServiceIds = watch('serviceIds');

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedApiResponse<Branch>>(
        '/branches',
        {
          params: { limit: 100 },
        },
      );
      return data.data;
    },
    staleTime: Infinity,
  });

  const { data: clients } = useQuery({
    queryKey: ['clients', clientSearch],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedApiResponse<Client>>(
        '/clients',
        {
          params: { search: clientSearch, limit: 10 },
        },
      );
      return data.data;
    },
    enabled: clientSearch.length >= 2,
  });

  const { data: vehicles } = useQuery({
    queryKey: ['vehicles', clientId],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedApiResponse<Vehicle>>(
        '/vehicles',
        {
          params: { clientId, limit: 50 },
        },
      );
      return data.data;
    },
    enabled: !!clientId,
  });

  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedApiResponse<Service>>(
        '/services',
        {
          params: { limit: 100 },
        },
      );
      return data.data.filter((s: Service) => s.isActive);
    },
    staleTime: Infinity,
  });

  const { data: workPosts } = useQuery({
    queryKey: ['work-posts', branchId],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedApiResponse<WorkPost>>(
        '/work-posts',
        {
          params: { branchId, limit: 50 },
        },
      );
      return data.data;
    },
    enabled: !!branchId,
  });

  const { data: workersData } = useQuery({
    queryKey: ['workforce-profiles', branchId],
    queryFn: () => fetchProfiles({ branchId, active: true, limit: 100 }),
    enabled: !!branchId,
    staleTime: 60_000,
  });
  const workers = (workersData?.items ?? []).filter(
    (w: EmployeeProfile) => w.isWorker,
  );

  const totalDuration = (services ?? [])
    .filter((s) => selectedServiceIds.includes(s.id))
    .reduce((sum, s) => sum + s.durationMin, 0);

  const totalPrice = (services ?? [])
    .filter((s) => selectedServiceIds.includes(s.id))
    .reduce((sum, s) => sum + Number(s.price), 0);

  const assignedEmployeeId = watch('assignedEmployeeId');

  const { data: slots } = useAvailability({
    branchId,
    date: selectedDate,
    durationMinutes: totalDuration || undefined,
    workPostId: selectedWorkPostId || undefined,
    assignedEmployeeId: assignedEmployeeId || undefined,
  });

  const availableSlots = (slots ?? []).filter((s) => s.available);

  function toggleService(serviceId: string) {
    const current = selectedServiceIds;
    const next = current.includes(serviceId)
      ? current.filter((id) => id !== serviceId)
      : [...current, serviceId];
    setValue('serviceIds', next, { shouldValidate: true });
    // Reset time slot since duration changed
    setValue('scheduledStart', '' as never);
    setValue('workPostId', undefined);
  }

  const handleQuickCreateClient = (values: ClientFormValues) => {
    createClientMut(values, {
      onSuccess: (newClient) => {
        setCreatedClient(newClient);
        setValue('clientId', newClient.id, {
          shouldValidate: true,
          shouldDirty: true,
        });
        setClientDialogOpen(false);
        setClientSearch(
          `${newClient.firstName} ${newClient.lastName ?? ''}`.trim(),
        );
        queryClient.invalidateQueries({ queryKey: ['clients'] });
      },
    });
  };

  const handleQuickCreateVehicle = (values: VehicleFormValues) => {
    createVehicleMut(
      {
        clientId,
        make: values.make,
        licensePlate: values.licensePlate || undefined,
        model: values.model || undefined,
        color: values.color || undefined,
        year: values.year,
      },
      {
        onSuccess: (newVehicle) => {
          setCreatedVehicle(newVehicle);
          setValue('vehicleId', newVehicle.id, {
            shouldValidate: true,
            shouldDirty: true,
          });
          setVehicleDialogOpen(false);
          resetVehicleForm();
          queryClient.invalidateQueries({ queryKey: ['vehicles'] });
        },
      },
    );
  };

  const onSubmit = (data: CreateOrderForm) => {
    createOrderMut(data, {
      onSuccess: () => navigate('/orders'),
    });
  };

  // Resolve display names for review step (prefer created entities over search results)
  const selectedClientName = (() => {
    if (createdClient && createdClient.id === clientId) {
      return `${createdClient.firstName} ${createdClient.lastName ?? ''}`.trim();
    }
    const found = clients?.find((c) => c.id === clientId);
    if (found) return `${found.firstName} ${found.lastName ?? ''}`.trim();
    // Fallback: clientSearch holds the selected client's name
    return clientSearch;
  })();

  const selectedVehiclePlate = (() => {
    const vid = watch('vehicleId');
    if (createdVehicle && createdVehicle.id === vid) {
      return (
        createdVehicle.licensePlate ??
        `${createdVehicle.make} ${createdVehicle.model ?? ''}`
      );
    }
    const found = vehicles?.find((v) => v.id === vid);
    if (!found) return '';
    return found.licensePlate ?? `${found.make} ${found.model ?? ''}`.trim();
  })();

  const steps = [
    t('creation.selectClient'),
    t('creation.selectVehicle'),
    t('creation.selectServices'),
    t('creation.selectWorker'),
    t('creation.selectSlot'),
    t('creation.review'),
  ];

  return (
    <div>
      <PageHeader
        title={t('createOrder')}
        actions={
          <Button variant="ghost" onClick={() => navigate('/orders')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {tc('actions.back')}
          </Button>
        }
      />

      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-2">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold',
                i < step
                  ? 'bg-success text-success-foreground'
                  : i === step
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={cn(
                'hidden text-sm md:inline',
                i === step && 'font-medium',
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && <div className="h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          {/* Step 0: Select Branch + Client */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label>{t('fields.branch')}</Label>
                <Select
                  options={(branches ?? []).map((b) => ({
                    value: b.id,
                    label: b.name,
                  }))}
                  placeholder={t('filters.branch')}
                  value={branchId ?? ''}
                  onChange={(e) =>
                    setValue('branchId', e.target.value, {
                      shouldValidate: true,
                    })
                  }
                  error={errors.branchId?.message}
                />
              </div>
              <div>
                <Label>{t('creation.searchClient')}</Label>
                <Input
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    if (clientId) {
                      setValue('clientId', '' as never);
                      setCreatedClient(null);
                    }
                  }}
                  placeholder={t('creation.searchClient')}
                />
              </div>
              {!clientId && clients && clients.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                  {clients.map((c) => (
                    <button
                      key={c.id}
                      className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-accent"
                      onClick={() => {
                        setValue('clientId', c.id, {
                          shouldValidate: true,
                          shouldDirty: true,
                        });
                        setClientSearch(
                          `${c.firstName} ${c.lastName ?? ''}`.trim(),
                        );
                      }}
                    >
                      <span className="font-medium">
                        {c.firstName} {c.lastName}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {c.phone}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setClientDialogOpen(true)}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {tc('actions.create')} {t('fields.client')}
                </Button>
              </div>
              <Button
                onClick={() => setStep(1)}
                disabled={!branchId || !clientId}
              >
                {tc('actions.next')}
              </Button>
            </div>
          )}

          {/* Step 1: Select Vehicle */}
          {step === 1 && (
            <div className="space-y-4">
              <CardHeader className="p-0">
                <CardTitle className="text-lg">
                  {t('creation.selectVehicle')}
                </CardTitle>
              </CardHeader>
              <div className="space-y-2">
                {(vehicles ?? []).map((v) => (
                  <button
                    key={v.id}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md border px-4 py-3 text-left hover:bg-accent',
                      watch('vehicleId') === v.id &&
                        'border-primary bg-primary/10',
                    )}
                    onClick={() =>
                      setValue('vehicleId', v.id, { shouldValidate: true })
                    }
                  >
                    <div>
                      <p className="font-medium">{v.licensePlate}</p>
                      {v.make && (
                        <p className="text-sm text-muted-foreground">
                          {v.make} {v.model} {v.year && `(${v.year})`}
                        </p>
                      )}
                    </div>
                    {watch('vehicleId') === v.id && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVehicleDialogOpen(true)}
              >
                <Plus className="mr-1 h-4 w-4" />
                {tc('actions.create')} {t('fields.vehicle')}
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(0)}>
                  {tc('actions.back')}
                </Button>
                <Button
                  onClick={() => setStep(2)}
                  disabled={!watch('vehicleId')}
                >
                  {tc('actions.next')}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Select Services */}
          {step === 2 && (
            <div className="space-y-4">
              <CardHeader className="p-0">
                <CardTitle className="text-lg">
                  {t('creation.selectServices')}
                </CardTitle>
              </CardHeader>
              <div className="space-y-2">
                {(services ?? []).map((s) => (
                  <button
                    key={s.id}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md border px-4 py-3 text-left hover:bg-accent',
                      selectedServiceIds.includes(s.id) &&
                        'border-primary bg-primary/10',
                    )}
                    onClick={() => toggleService(s.id)}
                  >
                    <div>
                      <p className="font-medium">{s.name}</p>
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
              {selectedServiceIds.length > 0 && (
                <div className="flex items-center justify-between rounded-md bg-muted p-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t('creation.totalDuration')}
                    </p>
                    <p className="font-semibold">
                      {formatDuration(totalDuration)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">
                      {t('creation.totalAmount')}
                    </p>
                    <p className="text-lg font-bold">
                      {formatCurrency(totalPrice)}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)}>
                  {tc('actions.back')}
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  disabled={selectedServiceIds.length === 0}
                >
                  {tc('actions.next')}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Select Worker (optional) */}
          {step === 3 && (
            <div className="space-y-4">
              <CardHeader className="p-0">
                <CardTitle className="text-lg">
                  {t('creation.selectWorker')}
                </CardTitle>
              </CardHeader>
              <div className="space-y-2">
                <button
                  className={cn(
                    'flex w-full items-center justify-between rounded-md border px-4 py-3 text-left hover:bg-accent',
                    !watch('assignedEmployeeId') &&
                      'border-primary bg-primary/10',
                  )}
                  onClick={() => {
                    setValue('assignedEmployeeId', undefined);
                    setValue('scheduledStart', '' as never);
                    setValue('workPostId', undefined);
                  }}
                >
                  <p className="font-medium">{t('creation.anyWorker')}</p>
                  {!watch('assignedEmployeeId') && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </button>
                {workers.map((w) => (
                  <button
                    key={w.id}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md border px-4 py-3 text-left hover:bg-accent',
                      watch('assignedEmployeeId') === w.id &&
                        'border-primary bg-primary/10',
                    )}
                    onClick={() => {
                      setValue('assignedEmployeeId', w.id, {
                        shouldValidate: true,
                      });
                      setValue('scheduledStart', '' as never);
                      setValue('workPostId', undefined);
                    }}
                  >
                    <div>
                      <p className="font-medium">
                        {w.user.firstName} {w.user.lastName}
                      </p>
                      {w.workStartTime && w.workEndTime && (
                        <p className="text-sm text-muted-foreground">
                          {w.workStartTime} – {w.workEndTime}
                        </p>
                      )}
                    </div>
                    {watch('assignedEmployeeId') === w.id && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)}>
                  {tc('actions.back')}
                </Button>
                <Button onClick={() => setStep(4)}>{tc('actions.next')}</Button>
              </div>
            </div>
          )}

          {/* Step 4: Select Time Slot */}
          {step === 4 && (
            <div className="space-y-4">
              <CardHeader className="p-0">
                <CardTitle className="text-lg">
                  {t('creation.selectSlot')}
                </CardTitle>
              </CardHeader>
              <div>
                <Label>Date</Label>
                <DatePicker
                  value={selectedDate}
                  onChange={setSelectedDate}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              {workPosts && workPosts.length > 0 && (
                <div>
                  <Label>{t('fields.workPost')}</Label>
                  <Select
                    options={[
                      { value: '', label: t('creation.anyWorkPost') },
                      ...(workPosts ?? []).map((wp) => ({
                        value: wp.id,
                        label: wp.name,
                      })),
                    ]}
                    value={selectedWorkPostId}
                    onChange={(e) => {
                      setSelectedWorkPostId(e.target.value);
                      setValue('scheduledStart', '' as never);
                      setValue('workPostId', undefined);
                    }}
                  />
                </div>
              )}
              {selectedDate && (
                <div>
                  <p className="mb-2 text-sm font-medium">
                    {t('creation.availableSlots')}
                  </p>
                  {availableSlots.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                      {availableSlots.map((slot) => (
                        <button
                          key={`${slot.start}-${slot.workPostId}`}
                          className={cn(
                            'rounded-md border px-3 py-2 text-center text-sm hover:bg-accent',
                            watch('scheduledStart') === slot.start &&
                              watch('workPostId') === slot.workPostId &&
                              'border-primary bg-primary/10 font-semibold',
                          )}
                          onClick={() => {
                            setValue('scheduledStart', slot.start, {
                              shouldValidate: true,
                            });
                            setValue('workPostId', slot.workPostId);
                          }}
                        >
                          {formatTime(slot.start)}
                          {!selectedWorkPostId && (
                            <span className="block text-xs text-muted-foreground">
                              {slot.workPostName}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t('creation.noSlots')}
                    </p>
                  )}
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(3)}>
                  {tc('actions.back')}
                </Button>
                <Button
                  onClick={() => setStep(5)}
                  disabled={!watch('scheduledStart')}
                >
                  {tc('actions.next')}
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Review & Confirm */}
          {step === 5 && (
            <div className="space-y-4">
              <CardHeader className="p-0">
                <CardTitle className="text-lg">
                  {t('creation.review')}
                </CardTitle>
              </CardHeader>
              <div className="space-y-3 rounded-md bg-muted/50 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t('fields.branch')}
                  </span>
                  <span className="font-medium">
                    {branches?.find((b) => b.id === branchId)?.name}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t('fields.client')}
                  </span>
                  <span className="font-medium">{selectedClientName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t('fields.vehicle')}
                  </span>
                  <span className="font-medium">{selectedVehiclePlate}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t('fields.assignedWorker')}
                  </span>
                  <span className="font-medium">
                    {(() => {
                      const wId = watch('assignedEmployeeId');
                      if (!wId) return t('creation.anyWorker');
                      const w = workers.find((w) => w.id === wId);
                      return w
                        ? `${w.user.firstName} ${w.user.lastName}`
                        : t('creation.anyWorker');
                    })()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t('fields.scheduledStart')}
                  </span>
                  <span className="font-medium">
                    {watch('scheduledStart')
                      ? formatDateTime(watch('scheduledStart'))
                      : ''}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t('fields.workPost')}
                  </span>
                  <span className="font-medium">
                    {workPosts?.find((wp) => wp.id === watch('workPostId'))
                      ?.name ?? '—'}
                  </span>
                </div>
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-sm text-muted-foreground">
                    {t('fields.services')}:
                  </p>
                  {(services ?? [])
                    .filter((s) => selectedServiceIds.includes(s.id))
                    .map((s) => (
                      <div key={s.id} className="flex justify-between text-sm">
                        <span>{s.name}</span>
                        <span>{formatCurrency(Number(s.price))}</span>
                      </div>
                    ))}
                </div>
                <div className="flex justify-between border-t border-border pt-3 text-lg font-bold">
                  <span>{t('creation.totalAmount')}</span>
                  <span>{formatCurrency(totalPrice)}</span>
                </div>
              </div>

              <div>
                <Label>{t('fields.notes')}</Label>
                <Input
                  onChange={(e) => setValue('notes', e.target.value)}
                  placeholder={t('fields.notes')}
                />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(4)}>
                  {tc('actions.back')}
                </Button>
                <Button onClick={handleSubmit(onSubmit)} loading={isPending}>
                  {t('creation.confirmBooking')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick-create Client Dialog */}
      <Dialog
        open={clientDialogOpen}
        onClose={() => setClientDialogOpen(false)}
      >
        <DialogHeader>
          <DialogTitle>
            {tc('actions.create')} {t('fields.client')}
          </DialogTitle>
        </DialogHeader>
        <ClientForm
          onSubmit={handleQuickCreateClient}
          onCancel={() => setClientDialogOpen(false)}
          loading={isCreatingClient}
        />
      </Dialog>

      {/* Quick-create Vehicle Dialog */}
      <Dialog
        open={vehicleDialogOpen}
        onClose={() => setVehicleDialogOpen(false)}
      >
        <DialogHeader>
          <DialogTitle>
            {tc('actions.create')} {t('fields.vehicle')}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleVehicleSubmit(handleQuickCreateVehicle)}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{tc('fields.make')}</Label>
              <Input
                {...registerVehicle('make')}
                placeholder={tc('fields.make')}
                error={vehicleErrors.make?.message}
              />
            </div>
            <div className="space-y-2">
              <Label>{tc('fields.licensePlate')}</Label>
              <Input
                {...registerVehicle('licensePlate')}
                placeholder={tc('fields.licensePlate')}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>{tc('fields.model')}</Label>
              <Input
                {...registerVehicle('model')}
                placeholder={tc('fields.model')}
              />
            </div>
            <div className="space-y-2">
              <Label>{tc('fields.color')}</Label>
              <Input
                {...registerVehicle('color')}
                placeholder={tc('fields.color')}
              />
            </div>
            <div className="space-y-2">
              <Label>{tc('fields.year')}</Label>
              <Input
                type="number"
                {...registerVehicle('year')}
                placeholder="2024"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setVehicleDialogOpen(false)}
            >
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" loading={isCreatingVehicle}>
              {tc('actions.create')}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
