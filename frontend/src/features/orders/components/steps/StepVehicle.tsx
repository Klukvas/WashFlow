import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Plus } from 'lucide-react';
import { useCreateVehicle } from '@/features/vehicles/hooks/useVehicles';
import { apiClient } from '@/shared/api/client';
import type { PaginatedApiResponse } from '@/shared/types/api';
import type { Vehicle } from '@/shared/types/models';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { CardHeader, CardTitle } from '@/shared/ui/card';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { cn } from '@/shared/utils/cn';

const vehicleSchema = z.object({
  make: z.string().min(1, 'required'),
  licensePlate: z.string().optional().or(z.literal('')),
  model: z.string().optional().or(z.literal('')),
  color: z.string().optional().or(z.literal('')),
  year: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : Number(v)),
    z.number().int().min(1900).max(2100).optional(),
  ),
});

type VehicleFormValues = z.infer<typeof vehicleSchema>;

interface StepVehicleProps {
  clientId: string;
  vehicleId: string;
  onVehicleChange: (vehicleId: string) => void;
  compact?: boolean;
  onNext: () => void;
  onBack: () => void;
}

export function StepVehicle({
  clientId,
  vehicleId,
  onVehicleChange,
  onNext,
  onBack,
  compact,
}: StepVehicleProps) {
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');
  const queryClient = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { mutate: createVehicleMut, isPending: isCreatingVehicle } =
    useCreateVehicle();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<VehicleFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- @hookform/resolvers v5 Resolver type targets RHF v8; project uses RHF v7
    resolver: zodResolver(vehicleSchema) as any,
  });

  const {
    data: vehicles,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ['vehicles', clientId],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedApiResponse<Vehicle>>(
        '/vehicles',
        { params: { clientId, limit: 50 } },
      );
      return data.data;
    },
    enabled: !!clientId,
  });

  const handleQuickCreate = (values: VehicleFormValues) => {
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
          if (!mounted.current) return;
          onVehicleChange(newVehicle.id);
          setDialogOpen(false);
          reset();
          queryClient.invalidateQueries({ queryKey: ['vehicles'] });
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <CardHeader className="p-0">
        <CardTitle className="text-lg">{t('creation.selectVehicle')}</CardTitle>
      </CardHeader>
      {isFetching && <p role="status">{tc('status.loading')}</p>}
      {isError && (
        <p role="alert" className="text-destructive">
          {tc('errors.loadFailed')}
        </p>
      )}
      {!isFetching && !isError && vehicles?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('quick.noVehicles')}</p>
      )}
      <div className="space-y-2">
        {(vehicles ?? []).map((v) => (
          <button
            key={v.id}
            aria-pressed={vehicleId === v.id}
            className={cn(
              'flex w-full items-center justify-between rounded-md border px-4 py-3 text-left hover:bg-accent',
              vehicleId === v.id && 'border-primary bg-primary/10',
            )}
            onClick={() => onVehicleChange(v.id)}
          >
            <div>
              <p className="font-medium">{v.licensePlate}</p>
              {v.make && (
                <p className="text-sm text-muted-foreground">
                  {v.make} {v.model} {v.year && `(${v.year})`}
                </p>
              )}
            </div>
            {vehicleId === v.id && <Check className="h-5 w-5 text-primary" />}
          </button>
        ))}
      </div>
      <PermissionGate permission="vehicles.create">
        <Button
          variant="outline"
          size="sm"
          disabled={!clientId}
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="mr-1 h-4 w-4" />
          {tc('actions.create')} {t('fields.vehicle')}
        </Button>
      </PermissionGate>
      {!compact && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}>
            {tc('actions.back')}
          </Button>
          <Button onClick={onNext} disabled={!vehicleId}>
            {tc('actions.next')}
          </Button>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        dismissable={!isCreatingVehicle}
        className="max-h-[90vh] overflow-y-auto"
        onClose={() => setDialogOpen(false)}
      >
        <DialogHeader>
          <DialogTitle>
            {tc('actions.create')} {t('fields.vehicle')}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            void handleSubmit(handleQuickCreate)(event);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quick-vehicle-make">{tc('fields.make')}</Label>
              <Input
                id="quick-vehicle-make"
                {...register('make')}
                placeholder={tc('fields.make')}
                error={errors.make?.message}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-vehicle-plate">
                {tc('fields.licensePlate')}
              </Label>
              <Input
                id="quick-vehicle-plate"
                {...register('licensePlate')}
                placeholder={tc('fields.licensePlate')}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="quick-vehicle-model">{tc('fields.model')}</Label>
              <Input
                id="quick-vehicle-model"
                {...register('model')}
                placeholder={tc('fields.model')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-vehicle-color">{tc('fields.color')}</Label>
              <Input
                id="quick-vehicle-color"
                {...register('color')}
                placeholder={tc('fields.color')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-vehicle-year">{tc('fields.year')}</Label>
              <Input
                type="number"
                id="quick-vehicle-year"
                {...register('year')}
                placeholder="2024"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
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
