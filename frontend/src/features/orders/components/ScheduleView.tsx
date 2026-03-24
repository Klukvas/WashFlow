import { useState, useMemo } from 'react';
import { isDateDayOff } from '../utils/schedule.utils';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAvailability } from '../hooks/useOrders';
import {
  useBranches,
  useBranchBookingSettings,
} from '@/features/branches/hooks/useBranches';
import { useWorkPosts } from '@/features/work-posts/hooks/useWorkPosts';
import { useBranchScope } from '@/shared/hooks/useBranchScope';
import type { TimeSlot } from '@/shared/types/api';
import { Select } from '@/shared/ui/select';
import { Label } from '@/shared/ui/label';
import { DatePicker } from '@/shared/ui/date-picker';
import { formatTime } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';

export function ScheduleView() {
  const { t } = useTranslation('orders');
  const navigate = useNavigate();
  const { branchId: userBranchId } = useBranchScope();

  const [branchId, setBranchId] = useState(userBranchId ?? '');
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [workPostFilter, setWorkPostFilter] = useState('');

  const { data: branchesData } = useBranches({ limit: 100 });
  const branches = branchesData?.items ?? [];

  const { data: workPostsData } = useWorkPosts({
    branchId,
    limit: 50,
  });
  const workPosts = useMemo(
    () => workPostsData?.items ?? [],
    [workPostsData?.items],
  );

  const { data: branchSettings } = useBranchBookingSettings(branchId);

  const isDayOff = useMemo(
    () => isDateDayOff(selectedDate, branchSettings?.workingDays),
    [selectedDate, branchSettings?.workingDays],
  );

  // Fetch availability without duration to get all raw slots
  const { data: slots, isLoading: slotsLoading } = useAvailability({
    branchId,
    date: selectedDate,
    workPostId: workPostFilter || undefined,
  });

  // Group slots by work post
  const { timeHeaders, gridData, filteredWorkPosts } = useMemo(() => {
    if (!slots || slots.length === 0 || workPosts.length === 0) {
      return { timeHeaders: [], gridData: new Map(), filteredWorkPosts: [] };
    }

    const filtered = workPostFilter
      ? workPosts.filter((wp) => wp.id === workPostFilter)
      : workPosts;

    // Collect all unique time starts sorted
    const timeSet = new Set<string>();
    for (const slot of slots) {
      timeSet.add(slot.start);
    }
    const headers = Array.from(timeSet).sort();

    // Build lookup: workPostId -> { start -> slot }
    const data = new Map<string, Map<string, TimeSlot>>();
    for (const wp of filtered) {
      data.set(wp.id, new Map());
    }
    for (const slot of slots) {
      const wpMap = data.get(slot.workPostId);
      if (wpMap) {
        wpMap.set(slot.start, slot);
      }
    }

    return {
      timeHeaders: headers,
      gridData: data,
      filteredWorkPosts: filtered,
    };
  }, [slots, workPosts, workPostFilter]);

  const handleSlotClick = (slot: TimeSlot) => {
    if (!slot.available) return;
    const params = new URLSearchParams({
      branchId,
      workPostId: slot.workPostId,
      date: selectedDate,
      time: slot.start,
    });
    navigate(`/orders/create?${params.toString()}`);
  };

  if (!branchId) {
    return (
      <div className="space-y-4">
        <div className="max-w-xs">
          <Label>{t('fields.branch')}</Label>
          <Select
            options={branches.map((b) => ({
              value: b.id,
              label: b.name,
            }))}
            placeholder={t('schedule.selectBranch')}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {t('schedule.selectBranchFirst')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-48">
          <Label>{t('fields.branch')}</Label>
          <Select
            options={branches.map((b) => ({
              value: b.id,
              label: b.name,
            }))}
            placeholder={t('schedule.selectBranch')}
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setWorkPostFilter('');
            }}
          />
        </div>
        <div className="w-48">
          <Label>{t('creation.date')}</Label>
          <DatePicker
            value={selectedDate}
            onChange={setSelectedDate}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>
        {workPosts.length > 0 && (
          <div className="w-48">
            <Label>{t('fields.workPost')}</Label>
            <Select
              options={[
                { value: '', label: t('creation.anyWorkPost') },
                ...workPosts.map((wp) => ({
                  value: wp.id,
                  label: wp.name,
                })),
              ]}
              value={workPostFilter}
              onChange={(e) => setWorkPostFilter(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Day off warning */}
      {isDayOff && (
        <div className="rounded-md border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
          {t('creation.branchClosed')}
        </div>
      )}

      {/* Schedule grid */}
      {!isDayOff && (
        <div className="overflow-x-auto rounded-md border border-border">
          {slotsLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filteredWorkPosts.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              {t('schedule.noWorkPosts')}
            </div>
          ) : timeHeaders.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              {t('creation.noSlots')}
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="sticky left-0 z-10 min-w-[120px] border-r border-border bg-muted/50 px-3 py-2 text-left font-medium">
                    {t('fields.workPost')}
                  </th>
                  {timeHeaders.map((time) => (
                    <th
                      key={time}
                      className="min-w-[70px] border-r border-border px-2 py-2 text-center font-medium"
                    >
                      {formatTime(time)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredWorkPosts.map((wp) => {
                  const wpSlots = gridData.get(wp.id);
                  return (
                    <tr key={wp.id} className="border-b border-border">
                      <td className="sticky left-0 z-10 border-r border-border bg-background px-3 py-2 font-medium">
                        {wp.name}
                      </td>
                      {timeHeaders.map((time) => {
                        const slot = wpSlots?.get(time);
                        const isAvailable = slot?.available ?? false;
                        return (
                          <td key={time} className="border-r border-border p-1">
                            <button
                              className={cn(
                                'flex h-8 w-full items-center justify-center rounded text-xs transition-colors',
                                isAvailable
                                  ? 'bg-success/10 text-success hover:bg-success/20'
                                  : 'cursor-default bg-muted text-muted-foreground',
                              )}
                              onClick={() => slot && handleSlotClick(slot)}
                              disabled={!isAvailable}
                              title={
                                isAvailable
                                  ? t('schedule.bookSlot')
                                  : t('schedule.occupied')
                              }
                            >
                              {isAvailable
                                ? t('schedule.free')
                                : t('schedule.occupied')}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-success/10" />
          <span>{t('schedule.free')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-muted" />
          <span>{t('schedule.occupied')}</span>
        </div>
      </div>
    </div>
  );
}
