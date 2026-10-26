import { usePermissions } from '@/shared/hooks/usePermissions';
import { useNow } from '@/shared/hooks/useNow';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAllBranches } from '@/features/branches/hooks/useBranches';
import { fetchClients } from '@/features/clients/api/clients.api';
import { fetchVehicles } from '@/features/vehicles/api/vehicles.api';
import { useCreateClient } from '@/features/clients/hooks/useClients';
import { ClientForm } from '@/features/clients/components/ClientForm';
import { useServices } from '@/features/services/hooks/useServices';
import { useBranchScope } from '@/shared/hooks/useBranchScope';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { PageHeader } from '@/shared/components/PageHeader';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Label } from '@/shared/ui/label';
import { Dialog, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import type { Client } from '@/shared/types/models';
import {
  branchDate,
  branchTime,
  isFutureStart,
} from '@/shared/utils/branch-time';
import { decimalMoney, displayMoney, moneyCents } from '@/shared/utils/money';
import { useAvailability, useCreateOrder } from '../hooks/useOrders';
import { StepVehicle } from './steps/StepVehicle';

const payloadSchema = z.object({
  branchId: z.uuid(),
  clientId: z.uuid(),
  vehicleId: z.uuid(),
  serviceIds: z.array(z.uuid()).min(1),
  scheduledStart: z.iso.datetime({ offset: true }),
  workPostId: z.uuid(),
});

export function QuickOrderForm() {
  const now = useNow();
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const scope = useBranchScope();
  const { hasPermission } = usePermissions();
  const branchesQuery = useAllBranches(hasPermission('branches.read'));
  const branches = (branchesQuery.data ?? []).filter(
    (b) =>
      b.isActive &&
      !b.deletedAt &&
      (!scope.branchId || b.id === scope.branchId),
  );
  const [chosenBranch, setBranch] = useState(params.get('branchId') ?? '');
  const branchId =
    scope.branchId ??
    (chosenBranch || (branches.length === 1 ? branches[0].id : ''));
  const branch = branches.find((b) => b.id === branchId);
  const [chosenDate, setDate] = useState(params.get('date') ?? '');
  const date =
    chosenDate || (branch ? branchDate(new Date(), branch.timezone) : '');
  const [search, setSearch] = useState('');
  const query = useDebounce(search, 250);
  const [client, setClient] = useState<Client | null>(null);
  const [vehicleId, setVehicle] = useState('');
  const [serviceIds, setServices] = useState<string[]>([]);
  const [chosenSlot, setSlot] = useState(
    params.get('time') && params.get('workPostId')
      ? `${params.get('time')}|${params.get('workPostId')}`
      : '',
  );
  const [clientDialog, setClientDialog] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const context = useRef(0);
  const submitting = useRef(false);
  const creation = useCreateOrder();
  const clientCreation = useCreateClient();
  const servicesQuery = useServices({ limit: 100 });
  const services = (servicesQuery.data?.items ?? []).filter(
    (s) => s.isActive && !s.deletedAt,
  );
  const selectedServices = services.filter((s) => serviceIds.includes(s.id));
  const duration = selectedServices.reduce((sum, s) => sum + s.durationMin, 0);
  const total = selectedServices.reduce(
    (sum, s) => sum + moneyCents(s.price),
    0n,
  );
  const clients = useQuery({
    queryKey: ['clients', 'quick-search', query],
    queryFn: () => fetchClients({ search: query, limit: 10 }),
    enabled: query.length >= 2 && !client,
  });
  const vehicles = useQuery({
    queryKey: ['vehicles', 'quick-search', query],
    queryFn: () => fetchVehicles({ search: query, limit: 10 }),
    enabled: query.length >= 2 && !client,
  });
  const slots = useAvailability({
    branchId: duration && branch ? branchId : '',
    date,
    durationMinutes: duration || undefined,
  });
  const available = (slots.data ?? [])
    .filter((s) => s.available && new Date(s.start).getTime() > now)
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) ||
        a.workPostId.localeCompare(b.workPostId),
    );
  const slotKey = (start: string, post: string) => `${start}|${post}`;
  const slot = chosenSlot
    ? available.find((s) => slotKey(s.start, s.workPostId) === chosenSlot)
    : available[0];
  const ready =
    hasPermission('orders.create') &&
    !!branch &&
    !!client &&
    !!vehicleId &&
    serviceIds.length === selectedServices.length &&
    duration > 0 &&
    !!slot &&
    !slots.isFetching &&
    !slots.isStale &&
    !slots.isError &&
    !servicesQuery.isFetching &&
    !branchesQuery.isFetching &&
    !creation.isPending;
  function resetSlot(clear = true) {
    if (clear) setSlot('');
    setInvalid(false);
    context.current += 1;
  }
  function selectClient(next: Client, selectedVehicle = '') {
    setClient(next);
    setVehicle(selectedVehicle);
    setSearch('');
    setInvalid(false);
    context.current += 1;
  }
  function submit() {
    if (!ready || !slot || submitting.current || !isFutureStart(slot.start))
      return;
    const result = payloadSchema.safeParse({
      branchId,
      clientId: client?.id,
      vehicleId,
      serviceIds,
      scheduledStart: slot.start,
      workPostId: slot.workPostId,
    });
    if (!result.success) {
      setInvalid(true);
      return;
    }
    submitting.current = true;
    creation.mutate(result.data, {
      onSuccess: (order) => navigate(`/orders/${order.id}`),
      onSettled: () => {
        submitting.current = false;
      },
    });
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title={t('quick.title')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                navigate(
                  `/orders/create?${new URLSearchParams({ ...Object.fromEntries(params), mode: 'wizard' })}`,
                )
              }
            >
              {t('quick.wizard')}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/orders')}>
              {tc('actions.back')}
            </Button>
          </div>
        }
      />
      <p className="text-sm text-muted-foreground">{t('quick.description')}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-5 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="quick-branch">{t('fields.branch')}</Label>
                <Select
                  id="quick-branch"
                  value={branchId}
                  disabled={scope.isBranchScoped || creation.isPending}
                  placeholder={t('schedule.selectBranch')}
                  options={branches.map((b) => ({
                    value: b.id,
                    label: b.name,
                  }))}
                  onChange={(e) => {
                    setBranch(e.target.value);
                    setDate('');
                    setVehicle('');
                    resetSlot();
                  }}
                />
              </div>
              <div>
                <Label htmlFor="quick-date">{t('creation.date')}</Label>
                <Input
                  id="quick-date"
                  type="date"
                  className="dark:[color-scheme:dark]"
                  value={date}
                  min={
                    branch ? branchDate(new Date(), branch.timezone) : undefined
                  }
                  disabled={!branch || creation.isPending}
                  onChange={(e) => {
                    setDate(e.target.value);
                    resetSlot();
                  }}
                />
              </div>
            </div>
            {branchesQuery.isError && (
              <p role="alert">{tc('errors.loadFailed')}</p>
            )}
            <div>
              <Label htmlFor="quick-search">{t('quick.search')}</Label>
              <Input
                id="quick-search"
                value={search}
                disabled={creation.isPending}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setClient(null);
                  setVehicle('');
                  resetSlot(false);
                }}
                placeholder={t('quick.searchPlaceholder')}
              />
            </div>
            {client ? (
              <div className="rounded-md bg-muted/50 p-3">
                <p className="font-medium">
                  {client.firstName} {client.lastName}
                </p>
                <p className="text-sm text-muted-foreground">{client.phone}</p>
              </div>
            ) : (
              query.length >= 2 && (
                <div className="max-h-52 space-y-1 overflow-y-auto">
                  {clients.isFetching ||
                  vehicles.isFetching ||
                  query !== search ? (
                    <p role="status">{tc('status.loading')}</p>
                  ) : (
                    <>
                      {(clients.isError || vehicles.isError) && (
                        <p role="alert" className="text-destructive">
                          {tc('errors.loadFailed')}
                        </p>
                      )}
                      {clients.data?.items.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          className="w-full rounded-md border border-border p-3 text-left hover:bg-accent"
                          onClick={() => selectClient(c)}
                        >
                          {c.firstName} {c.lastName}
                          <span className="ml-2 text-sm text-muted-foreground">
                            {c.phone}
                          </span>
                        </button>
                      ))}
                      {vehicles.data?.items
                        .filter((v) => v.client)
                        .map((v) => (
                          <button
                            type="button"
                            key={v.id}
                            className="w-full rounded-md border border-border p-3 text-left hover:bg-accent"
                            onClick={() => {
                              if (v.client) selectClient(v.client, v.id);
                            }}
                          >
                            {v.licensePlate} · {v.make}
                            <span className="ml-2 text-sm text-muted-foreground">
                              {v.client?.firstName} {v.client?.lastName}
                            </span>
                          </button>
                        ))}
                      {!clients.isError &&
                        !vehicles.isError &&
                        !clients.data?.items.length &&
                        !vehicles.data?.items.length && (
                          <p>{t('quick.noMatches')}</p>
                        )}
                    </>
                  )}
                </div>
              )
            )}
            <PermissionGate permission="clients.create">
              <Button
                variant="outline"
                size="sm"
                disabled={creation.isPending}
                onClick={() => setClientDialog(true)}
              >
                {t('quick.newClient')}
              </Button>
            </PermissionGate>
            {client && (
              <fieldset disabled={creation.isPending}>
                <StepVehicle
                  key={client.id}
                  compact
                  clientId={client.id}
                  vehicleId={vehicleId}
                  onVehicleChange={(id) => {
                    if (!creation.isPending) {
                      setVehicle(id);
                      resetSlot(false);
                    }
                  }}
                  onNext={() => {}}
                  onBack={() => {}}
                />
              </fieldset>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-5 p-5">
            <fieldset disabled={creation.isPending}>
              <legend className="mb-2 font-semibold">
                {t('fields.services')}
              </legend>
              <div className="space-y-2">
                {servicesQuery.isLoading && (
                  <p role="status">{tc('status.loading')}</p>
                )}
                {servicesQuery.isError && (
                  <p role="alert">{tc('errors.loadFailed')}</p>
                )}
                {!servicesQuery.isLoading &&
                  !servicesQuery.isError &&
                  services.length === 0 && <p>{t('noServices')}</p>}
                {services.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={serviceIds.includes(s.id)}
                      onChange={() => {
                        setServices((ids) =>
                          ids.includes(s.id)
                            ? ids.filter((id) => id !== s.id)
                            : [...ids, s.id],
                        );
                        setInvalid(false);
                        context.current += 1;
                      }}
                    />
                    <span className="flex-1">
                      {s.name}
                      <span className="block text-xs text-muted-foreground">
                        {s.durationMin} {t('quick.minutes')}
                      </span>
                    </span>
                    <span className="text-sm font-medium">
                      {displayMoney(s.price)}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <Label htmlFor="quick-slot">{t('quick.earliest')}</Label>
              <Select
                id="quick-slot"
                disabled={
                  !duration ||
                  slots.isFetching ||
                  slots.isError ||
                  creation.isPending
                }
                value={slot ? slotKey(slot.start, slot.workPostId) : ''}
                placeholder={t(
                  duration ? 'creation.noSlots' : 'quick.servicesFirst',
                )}
                options={available.map((s) => ({
                  value: slotKey(s.start, s.workPostId),
                  label: `${branchTime(s.start, branch?.timezone ?? 'UTC')} · ${s.workPostName}`,
                }))}
                onChange={(e) => setSlot(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {branch?.timezone}
              </p>
              {!!duration && chosenSlot && !slot && !slots.isFetching && (
                <p role="alert" className="text-warning-foreground">
                  {t('quick.slotChanged')}
                </p>
              )}
              {slots.isFetching && <p role="status">{t('quick.checking')}</p>}
              {slots.isError && (
                <p role="alert" className="text-destructive">
                  {tc('errors.loadFailed')}
                </p>
              )}
              {!!duration &&
                !slots.isFetching &&
                !slots.isError &&
                !available.length && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t('creation.noSlots')}
                  </p>
                )}
            </div>
            <div className="flex items-center justify-between border-t border-border pt-4">
              <span>
                {duration} {t('quick.minutes')}
              </span>
              <strong className="text-xl">
                {displayMoney(decimalMoney(total))}
              </strong>
            </div>
            {invalid && (
              <p role="alert" className="text-destructive">
                {t('quick.invalid')}
              </p>
            )}
            <Button
              className="w-full"
              disabled={!ready}
              loading={creation.isPending}
              onClick={() => submit()}
            >
              {t('creation.confirmBooking')}
            </Button>
          </CardContent>
        </Card>
      </div>
      <Dialog
        open={clientDialog}
        dismissable={!clientCreation.isPending}
        onClose={() => setClientDialog(false)}
        className="max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t('quick.newClient')}</DialogTitle>
        </DialogHeader>
        <ClientForm
          loading={clientCreation.isPending}
          onCancel={() => setClientDialog(false)}
          onSubmit={(values) => {
            const version = context.current;
            clientCreation.mutate(values, {
              onSuccess: (c) => {
                if (context.current === version) selectClient(c);
                setClientDialog(false);
              },
            });
          }}
        />
      </Dialog>
    </div>
  );
}
