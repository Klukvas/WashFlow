import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { fetchProfiles } from '@/features/workforce/api/workforce.api';
import type { EmployeeProfile } from '@/shared/types/models';
import { Button } from '@/shared/ui/button';
import { CardHeader, CardTitle } from '@/shared/ui/card';
import { cn } from '@/shared/utils/cn';

interface StepWorkerProps {
  branchId: string;
  assignedEmployeeId: string | undefined;
  onWorkerChange: (workerId: string | undefined) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepWorker({
  branchId,
  assignedEmployeeId,
  onWorkerChange,
  onNext,
  onBack,
}: StepWorkerProps) {
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');

  const { data: workersData } = useQuery({
    queryKey: ['workforce-profiles', branchId],
    queryFn: () => fetchProfiles({ branchId, active: true, limit: 100 }),
    enabled: !!branchId,
    staleTime: 60_000,
  });

  const workers = (workersData?.items ?? []).filter(
    (w: EmployeeProfile) => w.isWorker,
  );

  return (
    <div className="space-y-4">
      <CardHeader className="p-0">
        <CardTitle className="text-lg">{t('creation.selectWorker')}</CardTitle>
      </CardHeader>
      <div className="space-y-2">
        <button
          aria-pressed={!assignedEmployeeId}
          className={cn(
            'flex w-full items-center justify-between rounded-md border px-4 py-3 text-left hover:bg-accent',
            !assignedEmployeeId && 'border-primary bg-primary/10',
          )}
          onClick={() => onWorkerChange(undefined)}
        >
          <p className="font-medium">{t('creation.anyWorker')}</p>
          {!assignedEmployeeId && <Check className="h-5 w-5 text-primary" />}
        </button>
        {workers.map((w) => (
          <button
            key={w.id}
            aria-pressed={assignedEmployeeId === w.id}
            className={cn(
              'flex w-full items-center justify-between rounded-md border px-4 py-3 text-left hover:bg-accent',
              assignedEmployeeId === w.id && 'border-primary bg-primary/10',
            )}
            onClick={() => onWorkerChange(w.id)}
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
            {assignedEmployeeId === w.id && (
              <Check className="h-5 w-5 text-primary" />
            )}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          {tc('actions.back')}
        </Button>
        <Button onClick={onNext}>{tc('actions.next')}</Button>
      </div>
    </div>
  );
}
