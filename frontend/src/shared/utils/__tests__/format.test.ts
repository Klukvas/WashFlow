import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDuration } from '../format';

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
});
