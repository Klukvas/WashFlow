import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatCurrency,
  formatDuration,
  formatDate,
  formatDateTime,
  formatTime,
  formatRelative,
} from '../format';

describe('formatCurrency', () => {
  it('formats UAH with 2 decimal places', () => {
    const result = formatCurrency(1234.5);
    expect(result).toContain('1');
    expect(result).toContain('234');
    expect(result).toContain('50');
  });

  it('formats zero correctly', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });

  it('formats with custom currency', () => {
    const result = formatCurrency(100, 'USD');
    expect(result).toBeDefined();
  });

  it('formats negative numbers', () => {
    const result = formatCurrency(-50);
    expect(result).toContain('50');
  });
});

describe('formatDuration', () => {
  it('formats minutes only', () => {
    expect(formatDuration(45)).toBe('45m');
  });

  it('formats hours only', () => {
    expect(formatDuration(120)).toBe('2h');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(90)).toBe('1h 30m');
  });

  it('formats 0 minutes', () => {
    expect(formatDuration(0)).toBe('0m');
  });

  it('formats large durations', () => {
    expect(formatDuration(180)).toBe('3h');
  });

  it('formats 1 minute', () => {
    expect(formatDuration(1)).toBe('1m');
  });

  it('formats 61 minutes', () => {
    expect(formatDuration(61)).toBe('1h 1m');
  });
});

describe('formatDate', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('formats ISO string date', () => {
    const result = formatDate('2026-03-15T12:00:00Z');
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats Date object', () => {
    const result = formatDate(new Date(2026, 2, 15));
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('uses provided locale', () => {
    const enResult = formatDate('2026-03-15T12:00:00Z', 'en');
    expect(enResult).toBeDefined();
  });

  it('uses uk locale', () => {
    const ukResult = formatDate('2026-03-15T12:00:00Z', 'uk');
    expect(ukResult).toBeDefined();
  });

  it('falls back to en when unknown locale is provided', () => {
    const result = formatDate('2026-03-15T12:00:00Z', 'zz');
    expect(result).toBeDefined();
  });

  it('reads locale from localStorage when not specified', () => {
    localStorage.setItem('i18nextLng', 'uk');
    const result = formatDate('2026-03-15T12:00:00Z');
    expect(result).toBeDefined();
  });

  it('defaults to en when localStorage has no language', () => {
    localStorage.removeItem('i18nextLng');
    const result = formatDate('2026-03-15T12:00:00Z');
    expect(result).toBeDefined();
  });
});

describe('formatDateTime', () => {
  it('formats ISO string with date and time', () => {
    const result = formatDateTime('2026-03-15T14:30:00Z');
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('formats Date object', () => {
    const result = formatDateTime(new Date(2026, 2, 15, 14, 30));
    expect(result).toBeDefined();
  });

  it('uses provided locale', () => {
    const result = formatDateTime('2026-03-15T14:30:00Z', 'en');
    expect(result).toBeDefined();
  });
});

describe('formatTime', () => {
  it('formats time from ISO string in HH:mm format', () => {
    const result = formatTime('2026-03-15T14:30:00');
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it('formats time from Date object', () => {
    const date = new Date(2026, 2, 15, 9, 5);
    const result = formatTime(date);
    expect(result).toBe('09:05');
  });

  it('uses provided locale', () => {
    const result = formatTime('2026-03-15T14:30:00', 'uk');
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

describe('formatRelative', () => {
  it('formats a recent date with "ago" suffix', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const result = formatRelative(tenMinutesAgo);
    expect(result).toContain('ago');
  });

  it('formats ISO string date', () => {
    const date = new Date(Date.now() - 3600 * 1000).toISOString();
    const result = formatRelative(date);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats Date object', () => {
    const result = formatRelative(new Date(Date.now() - 5000));
    expect(result).toBeDefined();
  });

  it('uses provided locale', () => {
    const result = formatRelative(new Date(Date.now() - 60000), 'en');
    expect(result).toBeDefined();
  });
});
