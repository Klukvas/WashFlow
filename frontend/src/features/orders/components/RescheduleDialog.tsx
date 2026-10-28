import { useNow } from '@/shared/hooks/useNow';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Order } from '@/shared/types/models';
import { useWorkPosts } from '@/features/work-posts/hooks/useWorkPosts';
import { fetchProfiles } from '@/features/workforce/api/workforce.api';
import { usePermissions } from '@/shared/hooks/usePermissions';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Label } from '@/shared/ui/label';
import { Button } from '@/shared/ui/button';
import {
  branchDate,
  branchTime,
  isFutureStart,
} from '@/shared/utils/branch-time';
import { formatFullName } from '@/shared/utils/format';
import { useAvailability, useRescheduleOrder } from '../hooks/useOrders';

export function RescheduleDialog({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const now = useNow();
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');
  const timezone = order.branch?.timezone ?? 'UTC';
  const [date, setDate] = useState(branchDate(order.scheduledStart, timezone));
  const [post, setPost] = useState('');
  const [worker, setWorker] = useState('');
  const [selected, setSelected] = useState('');
  const { hasPermission } = usePermissions();
  const mutation = useRescheduleOrder();
  const submitting = useRef(false);
  const posts = useWorkPosts({ branchId: order.branchId, limit: 100 });
  const workers = useQuery({
    queryKey: ['workforce', 'reschedule', order.branchId],
    queryFn: () =>
      fetchProfiles({ branchId: order.branchId, active: true, limit: 100 }),
    enabled: hasPermission('workforce.read'),
  });
  const duration = Math.ceil(
    (Date.parse(order.scheduledEnd) - Date.parse(order.scheduledStart)) /
      60_000,
  );
  const slots = useAvailability({
    branchId: order.branchId,
    date,
    durationMinutes: duration,
    workPostId: post || order.workPostId || undefined,
    assignedEmployeeId: worker || order.assignedEmployeeId || undefined,
    excludeOrderId: order.id,
  });
  const available = (slots.data ?? []).filter(
    (s) => s.available && Date.parse(s.start) > now,
  );
  const chosen = available.find(
    (s) =>
      s.start === selected &&
      s.workPostId === (post || order.workPostId || s.workPostId),
  );
  const valid =
    (order.status === 'BOOKED' ||
      order.status === 'BOOKED_PENDING_CONFIRMATION') &&
    !!chosen &&
    !slots.isFetching &&
    !slots.isStale &&
    !slots.isError &&
    !mutation.isPending;
  function submit() {
    if (!valid || !chosen || submitting.current || !isFutureStart(chosen.start))
      return;
    submitting.current = true;
    mutation.mutate(
      {
        id: order.id,
        scheduledStart: chosen.start,
        ...(post ? { workPostId: post } : {}),
        ...(worker ? { assignedEmployeeId: worker } : {}),
      },
      {
        onSuccess: onClose,
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }
  return (
    <Dialog
      open
      onClose={onClose}
      dismissable={!mutation.isPending}
      className="max-h-[90vh] overflow-y-auto"
    >
      <DialogHeader>
        <DialogTitle>{t('reschedule.title')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('reschedule.description')} · {timezone}
        </p>
        <div>
          <Label htmlFor="reschedule-date">{t('creation.date')}</Label>
          <Input
            id="reschedule-date"
            type="date"
            className="dark:[color-scheme:dark]"
            value={date}
            min={branchDate(new Date(), timezone)}
            disabled={mutation.isPending}
            onChange={(e) => {
              setDate(e.target.value);
              setSelected('');
            }}
          />
        </div>
        <div>
          <Label htmlFor="reschedule-post">{t('fields.workPost')}</Label>
          <Select
            id="reschedule-post"
            value={post}
            disabled={mutation.isPending || posts.isFetching}
            options={[
              {
                value: '',
                label: t('reschedule.keepPost', {
                  name: order.workPost?.name ?? '—',
                }),
              },
              ...(posts.data?.items ?? []).map((p) => ({
                value: p.id,
                label: p.name,
              })),
            ]}
            onChange={(e) => {
              setPost(e.target.value);
              setSelected('');
            }}
          />
        </div>
        {hasPermission('workforce.read') && (
          <div>
            <Label htmlFor="reschedule-worker">
              {t('fields.assignedWorker')}
            </Label>
            <Select
              id="reschedule-worker"
              value={worker}
              disabled={mutation.isPending || workers.isFetching}
              options={[
                { value: '', label: t('reschedule.keepWorker') },
                ...(workers.data?.items ?? [])
                  .filter((w) => w.isWorker && w.active)
                  .map((w) => ({
                    value: w.id,
                    label: formatFullName(w.user.firstName, w.user.lastName),
                  })),
              ]}
              onChange={(e) => {
                setWorker(e.target.value);
                setSelected('');
              }}
            />
          </div>
        )}
        {(posts.isError || workers.isError) && (
          <p role="alert" className="text-destructive">
            {tc('errors.loadFailed')}
          </p>
        )}
        <div>
          <Label htmlFor="reschedule-slot">{t('creation.selectSlot')}</Label>
          <Select
            id="reschedule-slot"
            value={selected}
            disabled={slots.isFetching || mutation.isPending}
            placeholder={t('creation.selectSlot')}
            options={available.map((s) => ({
              value: s.start,
              label: `${branchTime(s.start, timezone)} · ${s.workPostName}`,
            }))}
            onChange={(e) => setSelected(e.target.value)}
          />
        </div>
        {slots.isFetching && <p role="status">{t('quick.checking')}</p>}
        {slots.isError && (
          <p role="alert" className="text-destructive">
            {tc('errors.loadFailed')}
          </p>
        )}
        {!slots.isFetching && !slots.isError && !available.length && (
          <p>{t('creation.noSlots')}</p>
        )}
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={onClose}
        >
          {tc('actions.cancel')}
        </Button>
        <Button
          disabled={!valid}
          loading={mutation.isPending}
          onClick={() => submit()}
        >
          {t('reschedule.save')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
