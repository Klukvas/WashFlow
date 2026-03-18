import { HealthCheckError } from '@nestjs/terminus';

// Mock ioredis before importing the indicator
const mockPing = jest.fn();
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    ping: mockPing,
  }));
});

import Redis from 'ioredis';
import { RedisHealthIndicator } from './redis-health.indicator';

describe('RedisHealthIndicator', () => {
  let indicator: RedisHealthIndicator;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = { get: jest.fn().mockReturnValue('redis://localhost:6379') };
    indicator = new RedisHealthIndicator(config as any);
  });

  it('returns healthy status when ping succeeds', async () => {
    mockPing.mockResolvedValue('PONG');

    const result = await indicator.isHealthy('redis');

    expect(result).toEqual({ redis: { status: 'up' } });
  });

  it('throws HealthCheckError when ping fails', async () => {
    mockPing.mockRejectedValue(new Error('Connection refused'));

    await expect(indicator.isHealthy('redis')).rejects.toThrow(
      HealthCheckError,
    );
  });

  it('includes error message in health check error details', async () => {
    mockPing.mockRejectedValue(new Error('ECONNREFUSED'));

    try {
      await indicator.isHealthy('redis');
      fail('Expected HealthCheckError');
    } catch (error) {
      expect(error).toBeInstanceOf(HealthCheckError);
      expect((error as HealthCheckError).causes).toEqual({
        redis: { status: 'down', message: 'connection failed' },
      });
    }
  });

  it('creates Redis with lazyConnect option', () => {
    expect(Redis).toHaveBeenCalledWith(
      'redis://localhost:6379',
      expect.objectContaining({ lazyConnect: true }),
    );
  });
});
