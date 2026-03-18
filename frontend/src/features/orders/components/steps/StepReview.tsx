import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { fetchProfiles } from '@/features/workforce/api/workforce.api';
import { useBranches } from '@/features/branches/hooks/useBranches';
import { useServices } from '@/features/services/hooks/useServices';
import { useWorkPosts } from '@/features/work-posts/hooks/useWorkPosts';
import type { EmployeeProfile } from '@/shared/types/models';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { CardHeader, CardTitle } from '@/shared/ui/card';
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
} from '@/shared/utils/format';

interface StepReviewProps {
  branchId: string;
  clientName: string;
  vehiclePlate: string;
  assignedEmployeeId: string | undefined;
  scheduledStart: string;
  workPostId: string | undefined;
  serviceIds: string[];
  notes: string;
  onNotesChange: (notes: string) => void;
  onBack: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function StepReview({
  branchId,
  clientName,
  vehiclePlate,
  assignedEmployeeId,
  scheduledStart,
  workPostId,
  serviceIds,
  notes,
  onNotesChange,
  onBack,
  onConfirm,
  isPending,
}: StepReviewProps) {
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');

  const { data: branchesData } = useBranches({ limit: 100 });
  const branches = branchesData?.items ?? [];

  const { data: servicesData } = useServices({ limit: 100 });
  const services = (servicesData?.items ?? []).filter((s) => s.isActive);

  const { data: workPostsData } = useWorkPosts({ branchId, limit: 50 });
  const workPosts = workPostsData?.items ?? [];

  const { data: workersData } = useQuery({
    queryKey: ['workforce-profiles', branchId],
    queryFn: () => fetchProfiles({ branchId, active: true, limit: 100 }),
    enabled: !!branchId,
    staleTime: 60_000,
  });

  const workers = (workersData?.items ?? []).filter(
    (w: EmployeeProfile) => w.isWorker,
  );

  const selectedServices = services.filter((s) => serviceIds.includes(s.id));
  const totalPrice = selectedServices.reduce(
    (sum, s) => sum + Number(s.price),
    0,
  );

  const workerName = (() => {
    if (!assignedEmployeeId) return t('creation.anyWorker');
    const w = workers.find((w) => w.id === assignedEmployeeId);
    return w
      ? `${w.user.firstName} ${w.user.lastName}`
      : t('creation.anyWorker');
  })();

  return (
    <div className="space-y-4">
      <CardHeader className="p-0">
        <CardTitle className="text-lg">{t('creation.review')}</CardTitle>
      </CardHeader>
      <div className="space-y-3 rounded-md bg-muted/50 p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('fields.branch')}</span>
          <span className="font-medium">
            {branches.find((b) => b.id === branchId)?.name}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('fields.client')}</span>
          <span className="font-medium">{clientName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('fields.vehicle')}</span>
          <span className="font-medium">{vehiclePlate}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {t('fields.assignedWorker')}
          </span>
          <span className="font-medium">{workerName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {t('fields.scheduledStart')}
          </span>
          <span className="font-medium">
            {scheduledStart ? formatDateTime(scheduledStart) : ''}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('fields.workPost')}</span>
          <span className="font-medium">
            {workPosts.find((wp) => wp.id === workPostId)?.name ?? '—'}
          </span>
        </div>
        <div className="border-t border-border pt-3">
          <p className="mb-2 text-sm text-muted-foreground">
            {t('fields.services')}:
          </p>
          {selectedServices.map((s) => (
            <div key={s.id} className="flex justify-between text-sm">
              <span>
                {s.name}{' '}
                <span className="text-muted-foreground">
                  ({formatDuration(s.durationMin)})
                </span>
              </span>
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
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder={t('fields.notes')}
        />
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          {tc('actions.back')}
        </Button>
        <Button onClick={onConfirm} loading={isPending}>
          {t('creation.confirmBooking')}
        </Button>
      </div>
    </div>
  );
}
