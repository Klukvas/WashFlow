import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { isDateDayOff } from '../../utils/schedule.utils';
import { useAvailability } from '../../hooks/useOrders';
import { useBranchBookingSettings } from '@/features/branches/hooks/useBranches';
import { apiClient } from '@/shared/api/client';
import type { PaginatedApiResponse } from '@/shared/types/api';
import type { WorkPost } from '@/shared/types/models';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';
import { CardHeader, CardTitle } from '@/shared/ui/card';
import { DatePicker } from '@/shared/ui/date-picker';
import { formatTime } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';

interface StepTimeSlotProps {
  branchId: string;
  selectedDate: string;
  selectedWorkPostId: string;
  scheduledStart: string;
  workPostId: string | undefined;
  totalDuration: number;
  assignedEmployeeId: string | undefined;
  onDateChange: (date: string) => void;
  onWorkPostFilterChange: (workPostId: string) => void;
  onSlotSelect: (start: string, workPostId: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepTimeSlot({
  branchId,
  selectedDate,
  selectedWorkPostId,
  scheduledStart,
  workPostId,
  totalDuration,
  assignedEmployeeId,
  onDateChange,
  onWorkPostFilterChange,
  onSlotSelect,
  onNext,
  onBack,
}: StepTimeSlotProps) {
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');

  const { data: workPosts } = useQuery({
    queryKey: ['work-posts', branchId],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedApiResponse<WorkPost>>(
        '/work-posts',
        { params: { branchId, limit: 50 } },
      );
      return data.data;
    },
    enabled: !!branchId,
  });

  const { data: branchBookingSettings } = useBranchBookingSettings(
    branchId ?? '',
  );

  const isDayOff = useMemo(
    () => isDateDayOff(selectedDate, branchBookingSettings?.workingDays),
    [selectedDate, branchBookingSettings?.workingDays],
  );

  const { data: slots, isFetching: isLoadingSlots } = useAvailability({
    branchId,
    date: selectedDate,
    durationMinutes: totalDuration || undefined,
    workPostId: selectedWorkPostId || undefined,
    assignedEmployeeId: assignedEmployeeId || undefined,
  });

  const availableSlots = (slots ?? []).filter((s) => s.available);

  return (
    <div className="space-y-4">
      <CardHeader className="p-0">
        <CardTitle className="text-lg">{t('creation.selectSlot')}</CardTitle>
      </CardHeader>
      <div>
        <Label>{t('creation.date')}</Label>
        <DatePicker
          value={selectedDate}
          onChange={onDateChange}
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
            onChange={(e) => onWorkPostFilterChange(e.target.value)}
          />
        </div>
      )}
      {selectedDate && isDayOff && (
        <div className="rounded-md border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
          {t('creation.branchClosed')}
        </div>
      )}
      {selectedDate && !isDayOff && (
        <div>
          <p className="mb-2 text-sm font-medium">
            {t('creation.availableSlots')}
          </p>
          {isLoadingSlots ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : availableSlots.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {availableSlots.map((slot) => (
                <button
                  key={`${slot.start}-${slot.workPostId}`}
                  className={cn(
                    'rounded-md border px-3 py-2 text-center text-sm hover:bg-accent',
                    scheduledStart === slot.start &&
                      workPostId === slot.workPostId &&
                      'border-primary bg-primary/10 font-semibold',
                  )}
                  onClick={() => onSlotSelect(slot.start, slot.workPostId)}
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
        <Button variant="outline" onClick={onBack}>
          {tc('actions.back')}
        </Button>
        <Button onClick={onNext} disabled={!scheduledStart || isDayOff}>
          {tc('actions.next')}
        </Button>
      </div>
    </div>
  );
}
