import { workingWindowForInterval } from './working-window.util';

describe('workingWindowForInterval', () => {
  it.each([
    [
      'Europe/Kyiv',
      '2026-10-25T00:00:00Z',
      '2026-10-25T01:30:00Z',
      '03:00',
      '04:00',
    ],
    [
      'Europe/Kyiv',
      '2026-10-25T00:00:00Z',
      '2026-10-25T01:00:00Z',
      '03:00',
      '04:00',
    ],
    [
      'Europe/Kyiv',
      '2026-10-25T01:00:00Z',
      '2026-10-25T01:30:00Z',
      '03:00',
      '03:30',
    ],
    [
      'America/New_York',
      '2026-11-01T05:00:00Z',
      '2026-11-01T06:30:00Z',
      '01:00',
      '02:00',
    ],
    [
      'Australia/Lord_Howe',
      '2026-04-04T14:30:00Z',
      '2026-04-04T15:15:00Z',
      '01:30',
      '02:00',
    ],
    [
      'Europe/Kyiv',
      '2026-03-29T00:30:00Z',
      '2026-03-29T01:30:00Z',
      '02:30',
      '04:30',
    ],
    ['UTC', '2026-10-16T19:30:00Z', '2026-10-16T20:00:00Z', '19:30', '20:00'],
    [
      'UTC',
      '2026-10-16T19:30:00Z',
      '2026-10-16T20:00:00.001Z',
      '19:30',
      '20:01',
    ],
  ])(
    'covers all local instants in %s from %s to %s',
    (timezone, start, end, startTime, endTime) => {
      expect(
        workingWindowForInterval(new Date(start), new Date(end), timezone),
      ).toEqual({ startTime, endTime });
    },
  );

  it.each([
    ['2026-10-16T23:45:00Z', '2026-10-17T00:15:00Z'],
    ['2026-10-16T23:30:00Z', '2026-10-17T00:00:00Z'],
    ['2026-10-16T10:00:00Z', '2026-10-16T10:00:00Z'],
  ])('rejects unsupported daily interval %s to %s', (start, end) => {
    expect(
      workingWindowForInterval(new Date(start), new Date(end), 'UTC'),
    ).toBeNull();
  });
});
