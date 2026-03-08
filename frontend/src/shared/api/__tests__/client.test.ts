import { describe, it, expect } from 'vitest';
import { toPaginated, withIdempotencyKey } from '../client';

describe('toPaginated', () => {
  it('converts PaginatedApiResponse to PaginatedResponse', () => {
    const apiResponse = {
      data: [{ id: '1' }, { id: '2' }],
      meta: {
        timestamp: '2026-01-01T00:00:00Z',
        total: 10,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    };

    const result = toPaginated(apiResponse);

    expect(result.items).toEqual([{ id: '1' }, { id: '2' }]);
    expect(result.meta).toEqual({
      total: 10,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it('handles empty data array', () => {
    const apiResponse = {
      data: [],
      meta: { timestamp: '2026-01-01T00:00:00Z', total: 0, page: 1, limit: 20, totalPages: 0 },
    };

    const result = toPaginated(apiResponse);
    expect(result.items).toEqual([]);
    expect(result.meta.total).toBe(0);
  });
});

describe('withIdempotencyKey', () => {
  it('adds idempotency-key header', () => {
    const config = withIdempotencyKey();
    expect(config.headers).toHaveProperty('idempotency-key');
    expect(typeof config.headers!['idempotency-key']).toBe('string');
  });

  it('preserves existing config', () => {
    const config = withIdempotencyKey({
      timeout: 5000,
      headers: { 'X-Custom': 'value' },
    });

    expect(config.timeout).toBe(5000);
    expect(config.headers!['X-Custom']).toBe('value');
    expect(config.headers).toHaveProperty('idempotency-key');
  });

  it('generates unique keys each call', () => {
    const config1 = withIdempotencyKey();
    const config2 = withIdempotencyKey();
    expect(config1.headers!['idempotency-key']).not.toBe(config2.headers!['idempotency-key']);
  });
});
