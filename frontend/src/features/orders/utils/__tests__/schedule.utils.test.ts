import { describe, it, expect } from 'vitest';
import { isDateDayOff } from '../schedule.utils';

describe('isDateDayOff', () => {
  // 2026-04-01 is a Wednesday (day 3)
  const WEDNESDAY = '2026-04-01';
  // 2026-04-05 is a Sunday (day 0)
  const SUNDAY = '2026-04-05';
  // 2026-04-06 is a Monday (day 1)
  const MONDAY = '2026-04-06';
  // 2026-04-04 is a Saturday (day 6)
  const SATURDAY = '2026-04-04';

  it('returns false when selectedDate is null', () => {
    expect(isDateDayOff(null, [1, 2, 3, 4, 5])).toBe(false);
  });

  it('returns false when workingDays is undefined', () => {
    expect(isDateDayOff(WEDNESDAY, undefined)).toBe(false);
  });

  it('returns false when the date falls on a working day', () => {
    // Wednesday (3) is in the working days list
    expect(isDateDayOff(WEDNESDAY, [1, 2, 3, 4, 5])).toBe(false);
  });

  it('returns true when the date falls on a non-working day', () => {
    // Sunday (0) is not in the Mon-Fri working days list
    expect(isDateDayOff(SUNDAY, [1, 2, 3, 4, 5])).toBe(true);
  });

  it('returns true for Saturday when branch works Mon-Fri', () => {
    expect(isDateDayOff(SATURDAY, [1, 2, 3, 4, 5])).toBe(true);
  });

  it('returns false for Monday when branch works Mon-Fri', () => {
    expect(isDateDayOff(MONDAY, [1, 2, 3, 4, 5])).toBe(false);
  });

  it('returns false when branch works every day', () => {
    expect(isDateDayOff(SUNDAY, [0, 1, 2, 3, 4, 5, 6])).toBe(false);
  });

  it('returns true for any date when workingDays is empty', () => {
    // Empty workingDays means no working days — every day is a day off
    expect(isDateDayOff(WEDNESDAY, [])).toBe(true);
  });

  it('handles weekend-only working schedule', () => {
    // Branch only works on weekends
    expect(isDateDayOff(SATURDAY, [0, 6])).toBe(false);
    expect(isDateDayOff(SUNDAY, [0, 6])).toBe(false);
    expect(isDateDayOff(MONDAY, [0, 6])).toBe(true);
  });
});
