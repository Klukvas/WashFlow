import { useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isBefore,
  startOfDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

interface CalendarGridProps {
  value: string;
  onChange: (date: string) => void;
  min?: string;
  className?: string;
}

export function CalendarGrid({
  value,
  onChange,
  min,
  className,
}: CalendarGridProps) {
  const [viewDate, setViewDate] = useState(() =>
    value ? new Date(value + 'T00:00:00') : new Date(),
  );

  const selected = value ? new Date(value + 'T00:00:00') : null;
  const minDate = min ? startOfDay(new Date(min + 'T00:00:00')) : null;

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekDays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  function isDisabled(day: Date) {
    return minDate ? isBefore(day, minDate) : false;
  }

  const monthLabel = format(viewDate, 'MMMM yyyy');

  return (
    <div
      role="group"
      aria-label={monthLabel}
      className={cn(
        'w-full max-w-xs rounded-md border border-border bg-card p-3',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="rounded-md p-1.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setViewDate((d) => subMonths(d, 1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">{monthLabel}</span>
        <button
          type="button"
          className="rounded-md p-1.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setViewDate((d) => addMonths(d, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1" role="grid">
        {weekDays.map((wd) => (
          <div
            key={wd}
            role="columnheader"
            className="flex h-9 items-center justify-center text-xs font-medium text-muted-foreground"
          >
            {wd}
          </div>
        ))}
        {days.map((day) => {
          const disabled = isDisabled(day);
          const isSelected = selected && isSameDay(day, selected);
          const isCurrentMonth = isSameMonth(day, viewDate);
          const isToday = isSameDay(day, new Date());

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={disabled}
              aria-label={format(day, 'EEEE, MMMM d, yyyy')}
              aria-selected={isSelected || undefined}
              aria-current={isToday ? 'date' : undefined}
              className={cn(
                'flex h-9 w-full items-center justify-center rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                !isCurrentMonth && 'text-muted-foreground/40',
                isCurrentMonth && !isSelected && 'hover:bg-accent',
                isToday && !isSelected && 'font-semibold text-primary',
                isSelected && 'bg-primary text-primary-foreground',
                disabled && 'cursor-not-allowed opacity-30',
              )}
              onClick={() => onChange(format(day, 'yyyy-MM-dd'))}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
