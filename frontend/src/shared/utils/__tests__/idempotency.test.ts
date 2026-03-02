import { describe, it, expect } from 'vitest';
import { generateIdempotencyKey } from '../idempotency';

describe('generateIdempotencyKey', () => {
  it('returns a string', () => {
    const key = generateIdempotencyKey();
    expect(typeof key).toBe('string');
  });

  it('returns UUID format', () => {
    const key = generateIdempotencyKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('generates unique keys each call', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateIdempotencyKey()));
    expect(keys.size).toBe(100);
  });
});
