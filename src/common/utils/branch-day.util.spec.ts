import { BadRequestException } from '@nestjs/common';
import {
  branchDayRange,
  bookingDayRestrictions,
  branchCalendarDay,
} from './branch-day.util';

describe('branch calendar days', () => {
  it.each([
    ['2026-03-08', 23],
    ['2026-11-01', 25],
  ])('converts both New York midnights independently on %s', (day, hours) => {
    const range = branchDayRange(day, 'America/New_York');
    expect((range.end.getTime() - range.start.getTime()) / 3600000).toBe(hours);
    expect(branchCalendarDay(range.start, 'America/New_York')).toBe(day);
    expect(
      branchCalendarDay(new Date(range.end.getTime() - 1), 'America/New_York'),
    ).toBe(day);
  });
  it('tests the requested calendar label, rather than UTC midnight in a negative offset', () => {
    expect(
      bookingDayRestrictions(
        '2026-11-02',
        'America/Los_Angeles',
        [1],
        30,
        new Date('2026-10-25T23:30Z'),
      ),
    ).toEqual({ isWorkingDay: true, isWithinAdvance: true });
    expect(
      branchCalendarDay(new Date('2026-11-03T02:00Z'), 'America/Los_Angeles'),
    ).toBe('2026-11-02');
  });
  it.each(['2026-02-30', '2026-11-02T00:00:00Z', 'invalid', '2026-2-02'])(
    'rejects invalid/non-calendar input %s',
    (day) => {
      expect(() => branchDayRange(day, 'UTC')).toThrow(BadRequestException);
    },
  );
});
