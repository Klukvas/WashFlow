import { formatInTimeZone } from 'date-fns-tz';

type WorkingWindow = { startTime: string; endTime: string };
const MINUTE_MS = 60_000;

function nextMinute(time: string): string {
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + 1;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The minute-precision daily shift needed to cover the entire [start, end) interval. */
export function workingWindowForInterval(
  start: Date,
  end: Date,
  timezone: string,
): WorkingWindow | null {
  if (end <= start) return null;
  const local = (instant: number) =>
    formatInTimeZone(instant, timezone, 'yyyy-MM-dd HH:mm');
  const localStart = local(start.getTime());
  const roundedEnd = local(Math.ceil(end.getTime() / MINUTE_MS) * MINUTE_MS);
  const day = localStart.slice(0, 10);
  // Profiles describe same-day shifts; retain the midnight/seconds boundary rule.
  if (roundedEnd.slice(0, 10) !== day) return null;
  let startTime = localStart.slice(11);
  let endTime = '00:00';

  // Walk UTC minute segments, including both sides of an offset transition.
  // Checking end - 1ms keeps the interval end exclusive, including at rollback.
  for (let cursor = start.getTime(); cursor < end.getTime(); ) {
    const segmentEnd = Math.min(
      (Math.floor(cursor / MINUTE_MS) + 1) * MINUTE_MS,
      end.getTime(),
    );
    const first = local(cursor);
    const last = local(segmentEnd - 1);
    if (first.slice(0, 10) !== day || last.slice(0, 10) !== day) return null;
    const segmentEndTime = nextMinute(last.slice(11));
    startTime = first.slice(11) < startTime ? first.slice(11) : startTime;
    endTime = segmentEndTime > endTime ? segmentEndTime : endTime;
    cursor = segmentEnd;
  }
  return { startTime, endTime };
}
