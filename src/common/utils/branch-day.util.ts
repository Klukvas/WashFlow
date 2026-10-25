import { BadRequestException } from '@nestjs/common';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export function assertCalendarDay(day: string): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(Date.parse(`${day}T00:00:00Z`)) ||
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day
  ) {
    throw new BadRequestException(
      'date must be a valid YYYY-MM-DD calendar day',
    );
  }
}

export function addCalendarDays(day: string, days: number): string {
  assertCalendarDay(day);
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function branchCalendarDay(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, 'yyyy-MM-dd');
}

export function branchDayRange(
  day: string,
  timezone: string,
): { start: Date; end: Date } {
  assertCalendarDay(day);
  // Convert each local midnight separately: DST days can contain 23 or 25 hours.
  return {
    start: fromZonedTime(`${day}T00:00:00`, timezone),
    end: fromZonedTime(`${addCalendarDays(day, 1)}T00:00:00`, timezone),
  };
}

export function bookingDayRestrictions(
  day: string,
  timezone: string,
  workingDays: number[],
  maxAdvanceDays: number,
  now = new Date(),
) {
  assertCalendarDay(day);
  return {
    isWorkingDay: workingDays.includes(
      new Date(`${day}T00:00:00Z`).getUTCDay(),
    ),
    isWithinAdvance:
      day <= addCalendarDays(branchCalendarDay(now, timezone), maxAdvanceDays),
  };
}
