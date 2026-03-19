import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useForm as useHookForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Check, User, Clock, Wrench } from 'lucide-react';
import { useCreateOrder } from '../hooks/useOrders';
import { StepBranchClient } from '../components/steps/StepBranchClient';
import { StepVehicle } from '../components/steps/StepVehicle';
import { StepServices } from '../components/steps/StepServices';
import { StepWorker } from '../components/steps/StepWorker';
import { StepTimeSlot } from '../components/steps/StepTimeSlot';
import { StepReview } from '../components/steps/StepReview';
import { useBranches } from '@/features/branches/hooks/useBranches';
import { useServices } from '@/features/services/hooks/useServices';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { cn } from '@/shared/utils/cn';

type WizardMode = 'client-first' | 'time-first' | 'service-first';

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

// Step definitions for each mode
function getModeSteps(mode: WizardMode): {
  id: string;
  labelKey: string;
}[] {
  switch (mode) {
    case 'client-first':
      return [
        { id: 'branch-client', labelKey: 'creation.selectClient' },
        { id: 'vehicle', labelKey: 'creation.selectVehicle' },
        { id: 'services', labelKey: 'creation.selectServices' },
        { id: 'worker', labelKey: 'creation.selectWorker' },
        { id: 'time-slot', labelKey: 'creation.selectSlot' },
        { id: 'review', labelKey: 'creation.review' },
      ];
    case 'time-first':
      return [
        { id: 'branch', labelKey: 'fields.branch' },
        { id: 'time-slot', labelKey: 'creation.selectSlot' },
        { id: 'services', labelKey: 'creation.selectServices' },
        { id: 'client', labelKey: 'creation.selectClient' },
        { id: 'vehicle', labelKey: 'creation.selectVehicle' },
        { id: 'worker', labelKey: 'creation.selectWorker' },
        { id: 'review', labelKey: 'creation.review' },
      ];
    case 'service-first':
      return [
        { id: 'branch', labelKey: 'fields.branch' },
        { id: 'services', labelKey: 'creation.selectServices' },
        { id: 'time-slot', labelKey: 'creation.selectSlot' },
        { id: 'client', labelKey: 'creation.selectClient' },
        { id: 'vehicle', labelKey: 'creation.selectVehicle' },
        { id: 'worker', labelKey: 'creation.selectWorker' },
        { id: 'review', labelKey: 'creation.review' },
      ];
  }
}

export function CreateOrderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');

  // URL prefill params
  const prefillBranchId = searchParams.get('branchId') ?? '';
  const prefillDate = searchParams.get('date') ?? '';
  const prefillTime = searchParams.get('time') ?? '';
  const prefillWorkPostId = searchParams.get('workPostId') ?? '';

  const hasPrefill = !!(prefillBranchId && prefillDate && prefillTime);

  // Mode selection
  const [mode, setMode] = useState<WizardMode | null>(
    hasPrefill ? 'time-first' : null,
  );
  const [step, setStep] = useState(0);

  // Extra state for mode-specific flows
  const [selectedDate, setSelectedDate] = useState(prefillDate);
  const [selectedWorkPostId, setSelectedWorkPostId] =
    useState(prefillWorkPostId);
  const [clientName, setClientName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');

  const queryClient = useQueryClient();
  const { mutate: createOrderMut, isPending } = useCreateOrder();

  const {
    setValue,
    resetField,
    watch,
    handleSubmit,
    formState: { errors },
  } = useHookForm<CreateOrderForm>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      serviceIds: [],
      branchId: prefillBranchId || undefined,
      scheduledStart: prefillTime || undefined,
      workPostId: prefillWorkPostId || undefined,
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library -- React Hook Form watch() is incompatible with React Compiler memoization
  const branchId = watch('branchId') ?? '';
  const clientId = watch('clientId') ?? '';
  const vehicleId = watch('vehicleId') ?? '';
  const selectedServiceIds = watch('serviceIds');
  const assignedEmployeeId = watch('assignedEmployeeId');
  const scheduledStart = watch('scheduledStart') ?? '';
  const formWorkPostId = watch('workPostId');
  const notes = watch('notes') ?? '';

  const { data: branchesData } = useBranches({ limit: 100 });
  const branches = branchesData?.items ?? [];

  const { data: servicesData } = useServices({ limit: 100 });
  const services = (servicesData?.items ?? []).filter((s) => s.isActive);

  const totalDuration = services
    .filter((s) => selectedServiceIds.includes(s.id))
    .reduce((sum, s) => sum + s.durationMin, 0);

  const currentSteps = useMemo(() => (mode ? getModeSteps(mode) : []), [mode]);

  function toggleService(serviceId: string) {
    const current = selectedServiceIds;
    const next = current.includes(serviceId)
      ? current.filter((id) => id !== serviceId)
      : [...current, serviceId];
    setValue('serviceIds', next, { shouldValidate: true });
    // Reset time slot since duration changed
    resetField('scheduledStart');
    setValue('workPostId', undefined);
  }

  const onSubmit = (data: CreateOrderForm) => {
    createOrderMut(data, {
      onSuccess: () => navigate('/orders'),
    });
  };

  // Mode selector screen
  if (!mode) {
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
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-6 text-center text-xl font-semibold">
            {t('creation.chooseStartMode')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(
              [
                {
                  mode: 'client-first' as const,
                  icon: User,
                  label: t('creation.startFromClient'),
                  desc: t('creation.startFromClientDesc'),
                },
                {
                  mode: 'time-first' as const,
                  icon: Clock,
                  label: t('creation.startFromTime'),
                  desc: t('creation.startFromTimeDesc'),
                },
                {
                  mode: 'service-first' as const,
                  icon: Wrench,
                  label: t('creation.startFromService'),
                  desc: t('creation.startFromServiceDesc'),
                },
              ] as const
            ).map(({ mode: m, icon: Icon, label, desc }) => (
              <button
                key={m}
                className="flex flex-col items-center gap-3 rounded-lg border-2 border-border p-6 text-center transition-colors hover:border-primary hover:bg-primary/5"
                onClick={() => {
                  setMode(m);
                  setStep(0);
                }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <p className="font-semibold">{label}</p>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const currentStepDef = currentSteps[step];

  function renderStep() {
    if (!currentStepDef) return null;
    const stepId = currentStepDef.id;

    switch (stepId) {
      case 'branch-client':
        return (
          <StepBranchClient
            branchId={branchId}
            clientId={clientId}
            branches={branches}
            onBranchChange={(id) =>
              setValue('branchId', id, { shouldValidate: true })
            }
            onClientChange={(id, name) => {
              setValue('clientId', id, {
                shouldValidate: true,
                shouldDirty: true,
              });
              setClientName(name);
            }}
            onNext={() => setStep((s) => s + 1)}
            branchError={errors.branchId?.message}
          />
        );

      case 'branch':
        // Branch-only step for time-first and service-first modes
        return (
          <div className="space-y-4">
            <div>
              <Label>{t('fields.branch')}</Label>
              <Select
                options={branches.map((b) => ({
                  value: b.id,
                  label: b.name,
                }))}
                placeholder={t('schedule.selectBranch')}
                value={branchId}
                onChange={(e) =>
                  setValue('branchId', e.target.value, { shouldValidate: true })
                }
              />
            </div>
            <Button onClick={() => setStep((s) => s + 1)} disabled={!branchId}>
              {tc('actions.next')}
            </Button>
          </div>
        );

      case 'client':
        // Client-only step (no branch selector) for time-first and service-first
        return (
          <StepBranchClient
            branchId={branchId}
            clientId={clientId}
            branches={branches}
            onBranchChange={(id) =>
              setValue('branchId', id, { shouldValidate: true })
            }
            onClientChange={(id, name) => {
              setValue('clientId', id, {
                shouldValidate: true,
                shouldDirty: true,
              });
              setClientName(name);
            }}
            onNext={() => setStep((s) => s + 1)}
            branchError={errors.branchId?.message}
            hideBranchSelector
          />
        );

      case 'vehicle':
        return (
          <StepVehicle
            clientId={clientId}
            vehicleId={vehicleId}
            onVehicleChange={(id) => {
              setValue('vehicleId', id, { shouldValidate: true });
              const cached = queryClient.getQueryData<
                { id: string; licensePlate: string }[]
              >(['vehicles', clientId]);
              const vehicle = cached?.find((v) => v.id === id);
              if (vehicle) setVehiclePlate(vehicle.licensePlate ?? '');
            }}
            onNext={() => setStep((s) => s + 1)}
            onBack={() => setStep((s) => s - 1)}
          />
        );

      case 'services':
        return (
          <StepServices
            serviceIds={selectedServiceIds}
            onToggleService={toggleService}
            onNext={() => setStep((s) => s + 1)}
            onBack={() => setStep((s) => s - 1)}
          />
        );

      case 'worker':
        return (
          <StepWorker
            branchId={branchId}
            assignedEmployeeId={assignedEmployeeId}
            onWorkerChange={(id) => {
              setValue('assignedEmployeeId', id);
              // Reset time slot when worker changes
              resetField('scheduledStart');
              setValue('workPostId', undefined);
            }}
            onNext={() => setStep((s) => s + 1)}
            onBack={() => setStep((s) => s - 1)}
          />
        );

      case 'time-slot':
        return (
          <StepTimeSlot
            branchId={branchId}
            selectedDate={selectedDate}
            selectedWorkPostId={selectedWorkPostId}
            scheduledStart={scheduledStart}
            workPostId={formWorkPostId}
            totalDuration={totalDuration}
            assignedEmployeeId={assignedEmployeeId}
            onDateChange={(date) => {
              setSelectedDate(date);
              resetField('scheduledStart');
              setValue('workPostId', undefined);
            }}
            onWorkPostFilterChange={(wpId) => {
              setSelectedWorkPostId(wpId);
              resetField('scheduledStart');
              setValue('workPostId', undefined);
            }}
            onSlotSelect={(start, wpId) => {
              setValue('scheduledStart', start, { shouldValidate: true });
              setValue('workPostId', wpId);
            }}
            onNext={() => setStep((s) => s + 1)}
            onBack={() => setStep((s) => s - 1)}
          />
        );

      case 'review':
        return (
          <StepReview
            branchId={branchId}
            clientName={clientName}
            vehiclePlate={vehiclePlate}
            assignedEmployeeId={assignedEmployeeId}
            scheduledStart={scheduledStart}
            workPostId={formWorkPostId}
            serviceIds={selectedServiceIds}
            notes={notes}
            onNotesChange={(n) => {
              setValue('notes', n);
            }}
            onBack={() => setStep((s) => s - 1)}
            onConfirm={handleSubmit(onSubmit)}
            isPending={isPending}
          />
        );

      default:
        return null;
    }
  }

  return (
    <div>
      <PageHeader
        title={t('createOrder')}
        actions={
          <div className="flex gap-2">
            {mode && (
              <Button
                variant="ghost"
                onClick={() => {
                  setMode(null);
                  setStep(0);
                }}
              >
                {t('creation.chooseStartMode')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => navigate('/orders')}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              {tc('actions.back')}
            </Button>
          </div>
        }
      />

      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-2 overflow-x-auto">
        {currentSteps.map(({ id, labelKey }, i) => (
          <div key={`${id}-${i}`} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
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
                'hidden whitespace-nowrap text-sm md:inline',
                i === step && 'font-medium',
              )}
            >
              {t(labelKey)}
            </span>
            {i < currentSteps.length - 1 && (
              <div className="h-px w-8 bg-border" />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">{renderStep()}</CardContent>
      </Card>
    </div>
  );
}
