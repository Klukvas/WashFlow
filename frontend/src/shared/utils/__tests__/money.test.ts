import { describe, it, expect } from 'vitest';
import { moneyCents, decimalMoney, displayMoney } from '../money';
import { branchDate, branchTime } from '../branch-time';

describe('exact operator money and local dates', () => {
  it('adds 0.10 and 0.20 without floating error, including large decimals', () => {
    expect(decimalMoney(moneyCents('0.10') + moneyCents('0.20'))).toBe('0.30');
    expect(displayMoney('9999999999999999.99')).toBe('9999999999999999.99 ₴');
    expect(() => moneyCents('1.001')).toThrow('Invalid money amount');
  });
  it('uses the branch date across UTC midnight and DST fallback', () => {
    expect(branchDate('2026-10-24T22:30:00Z', 'Europe/Kyiv')).toBe(
      '2026-10-25',
    );
    expect(branchTime('2026-10-25T00:30:00Z', 'Europe/Kyiv')).toBe('03:30');
    expect(branchTime('2026-10-25T01:30:00Z', 'Europe/Kyiv')).toBe('03:30');
  });
});
