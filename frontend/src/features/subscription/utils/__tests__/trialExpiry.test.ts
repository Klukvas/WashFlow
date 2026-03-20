import { describe, it, expect } from 'vitest';
import { isTrialExpired } from '../trialExpiry';

describe('isTrialExpired', () => {
  it('returns true for past date', () => {
    expect(isTrialExpired('2020-01-01T00:00:00Z')).toBe(true);
  });

  it('returns false for future date', () => {
    expect(isTrialExpired('2099-12-31T23:59:59Z')).toBe(false);
  });

  it('returns false for invalid date string', () => {
    expect(isTrialExpired('not-a-date')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isTrialExpired('')).toBe(false);
  });
});
