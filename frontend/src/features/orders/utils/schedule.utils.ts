/**
 * Returns true if the given date falls on a day that is not in the branch's
 * working days list (i.e. the branch is closed on that day).
 *
 * @param selectedDate - ISO date string (YYYY-MM-DD)
 * @param workingDays  - Array of day-of-week numbers (0 = Sunday, 6 = Saturday)
 */
export function isDateDayOff(
  selectedDate: string | null,
  workingDays?: number[],
): boolean {
  if (!selectedDate || !workingDays) return false;
  const dayOfWeek = new Date(selectedDate + 'T12:00:00').getDay();
  return !workingDays.includes(dayOfWeek);
}
