import { useNow } from '@/shared/hooks/useNow';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAvailability, useSchedule } from '../hooks/useOrders';
import { useBranches } from '@/features/branches/hooks/useBranches';
import { useBranchScope } from '@/shared/hooks/useBranchScope';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { DaySummary } from '@/features/analytics/components/DaySummary';
import { Select } from '@/shared/ui/select';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { branchDate, branchTime } from '@/shared/utils/branch-time';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/shared/utils/cn';

export function ScheduleView() {
  const now = useNow();
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const scope = useBranchScope();
  const [chosenBranch, setBranch] = useState('');
  const [chosenDate, setDate] = useState('');
  const [postFilter, setPostFilter] = useState('');
  const branchesQuery = useBranches({ limit: 100 });
  const branches = (branchesQuery.data?.items ?? []).filter(
    (b) =>
      b.isActive &&
      !b.deletedAt &&
      (!scope.branchId || scope.branchId === b.id),
  );
  const branchId =
    scope.branchId ??
    (chosenBranch || (branches.length === 1 ? branches[0].id : ''));
  const timezone = branches.find((b) => b.id === branchId)?.timezone ?? 'UTC';
  const date = chosenDate || branchDate(new Date(), timezone);
  const schedule = useSchedule(branchId, date);
  const slots = useAvailability({ branchId, date });
  const actualTimezone = schedule.data?.timezone ?? timezone;
  const orders = (schedule.data?.orders ?? []).filter(
    (o) => !postFilter || o.workPost?.id === postFilter,
  );
  const posts = Array.from(
    new Map([
      ...(schedule.data?.orders ?? []).flatMap((o) =>
        o.workPost ? [[o.workPost.id, o.workPost.name] as const] : [],
      ),
      ...(slots.data ?? []).map((s) => [s.workPostId, s.workPostName] as const),
    ]),
  );
  const available = (slots.data ?? []).filter(
    (s) =>
      s.available &&
      (!postFilter || s.workPostId === postFilter) &&
      Date.parse(s.start) > now,
  );
  return (
    <div data-testid="schedule-view" className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-52">
          <Label htmlFor="schedule-branch">{t('fields.branch')}</Label>
          <Select
            id="schedule-branch"
            disabled={scope.isBranchScoped}
            placeholder={t('schedule.selectBranch')}
            value={branchId}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
            onChange={(e) => {
              setBranch(e.target.value);
              setDate('');
              setPostFilter('');
            }}
          />
        </div>
        <div className="w-full sm:w-48">
          <Label htmlFor="schedule-date">{t('creation.date')}</Label>
          <Input
            id="schedule-date"
            type="date"
            className="dark:[color-scheme:dark]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <Label htmlFor="schedule-post">{t('fields.workPost')}</Label>
          <Select
            id="schedule-post"
            value={postFilter}
            options={[
              { value: '', label: t('creation.anyWorkPost') },
              ...posts.map(([id, name]) => ({ value: id, label: name })),
            ]}
            onChange={(e) => setPostFilter(e.target.value)}
          />
        </div>
        <p className="py-2 text-xs text-muted-foreground">{actualTimezone}</p>
      </div>
      {!branchId ? (
        <p>{t('schedule.selectBranchFirst')}</p>
      ) : (
        <>
          {(schedule.isLoading || slots.isLoading) && (
            <p role="status">{tc('status.loading')}</p>
          )}
          {(schedule.isError || branchesQuery.isError) && (
            <p role="alert" className="text-destructive">
              {tc('errors.loadFailed')}
            </p>
          )}
          <section className="space-y-2">
            <h2 className="font-semibold">{t('creation.availableSlots')}</h2>
            {slots.isError && (
              <p role="alert" className="text-destructive">
                {tc('errors.loadFailed')}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t('schedule.slotHint')}
            </p>
            <PermissionGate permission="orders.create">
              <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                {available.map((slot) => (
                  <button
                    key={`${slot.workPostId}-${slot.start}`}
                    data-testid="schedule-free-slot"
                    type="button"
                    disabled={slots.isFetching}
                    className="rounded-md border border-border bg-success/10 px-3 py-2 text-sm text-success hover:bg-success/20 disabled:opacity-50"
                    onClick={() =>
                      navigate(
                        `/orders/create?${new URLSearchParams({ branchId, date, time: slot.start, workPostId: slot.workPostId })}`,
                      )
                    }
                  >
                    {branchTime(slot.start, actualTimezone)} ·{' '}
                    {slot.workPostName}
                  </button>
                ))}
              </div>
            </PermissionGate>
            {!slots.isFetching && !slots.isError && !available.length && (
              <p>{t('creation.noSlots')}</p>
            )}
          </section>
          {schedule.data && (
            <>
              {branchDate(schedule.data.now, actualTimezone) === date && (
                <div
                  className="flex items-center gap-3 text-sm font-medium text-primary"
                  data-testid="schedule-now"
                >
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <span>
                    {t('schedule.now')}{' '}
                    {branchTime(schedule.data.now, actualTimezone)}
                  </span>
                  <span className="h-px flex-1 bg-primary/40" />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t('schedule.reservationHint')}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {orders.map((order) => (
                  <button
                    key={order.id}
                    data-testid="schedule-order"
                    type="button"
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className={cn(
                      'space-y-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary',
                      order.isOverdue && 'border-warning bg-warning/5',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-base">
                        {order.vehicle?.licensePlate ?? '—'}
                      </strong>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-sm">
                      {order.services.map((s) => s.name).join(', ') ||
                        t('noServices')}
                    </p>
                    <p className="text-sm font-medium">
                      {branchDate(order.scheduledStart, actualTimezone) !==
                        date &&
                        `${branchDate(order.scheduledStart, actualTimezone)} `}
                      {branchTime(order.scheduledStart, actualTimezone)} –{' '}
                      {branchTime(order.scheduledEnd, actualTimezone)} ·{' '}
                      {order.workPost?.name ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('fields.assignedWorker')}:{' '}
                      {order.assignedEmployee?.name ?? '—'}
                    </p>
                    {order.isOverdue && (
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                        {t('schedule.overdue')}
                      </p>
                    )}
                  </button>
                ))}
              </div>
              {!orders.length && (
                <p className="rounded-md border border-border p-5 text-sm text-muted-foreground">
                  {t('schedule.noOrders')}
                </p>
              )}
            </>
          )}

          <PermissionGate permission="analytics.view">
            <DaySummary branchId={branchId} date={date} />
          </PermissionGate>
        </>
      )}
    </div>
  );
}
