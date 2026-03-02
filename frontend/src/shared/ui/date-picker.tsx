import { useState, useRef, useEffect } from 'react';
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
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

/* ------------------------------------------------------------------ */
/*  CalendarGrid — reusable inline calendar                           */
/* ------------------------------------------------------------------ */

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

  return (
    <div
      className={cn(
        'w-72 rounded-md border border-border bg-card p-3',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="rounded-md p-1 hover:bg-accent"
          onClick={() => setViewDate((d) => subMonths(d, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {format(viewDate, 'MMMM yyyy')}
        </span>
        <button
          type="button"
          className="rounded-md p-1 hover:bg-accent"
          onClick={() => setViewDate((d) => addMonths(d, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((wd) => (
          <div
            key={wd}
            className="flex h-8 items-center justify-center text-xs font-medium text-muted-foreground"
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
              className={cn(
                'flex h-8 w-full items-center justify-center rounded-md text-sm transition-colors',
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

/* ------------------------------------------------------------------ */
/*  DatePicker — dropdown variant (click-to-open)                     */
/* ------------------------------------------------------------------ */

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  min?: string;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  min,
  placeholder = 'Select date',
  clearable,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value ? new Date(value + 'T00:00:00') : null;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <button
        type="button"
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          !value && 'text-muted-foreground',
        )}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-left">
          {selected ? format(selected, 'dd MMM yyyy') : placeholder}
        </span>
        {clearable && value && (
          <X
            className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleClear}
          />
        )}
      </button>

      {open && (
        <CalendarGrid
          value={value}
          onChange={(date) => {
            onChange(date);
            setOpen(false);
          }}
          min={min}
          className="absolute z-50 mt-1 shadow-lg animate-in fade-in zoom-in-95"
        />
      )}
    </div>
  );
}
