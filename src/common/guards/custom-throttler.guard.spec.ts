import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './custom-throttler.guard';

describe('CustomThrottlerGuard', () => {
  let guard: CustomThrottlerGuard;
  const mockOptions = [
    { name: 'short', ttl: 1000, limit: 10 },
    { name: 'long', ttl: 60000, limit: 100 },
  ];
  const mockStorageService = {} as any;
  const mockReflector = new Reflector();

  beforeEach(() => {
    guard = new CustomThrottlerGuard(
      mockOptions,
      mockStorageService,
      mockReflector,
    );
  });

  it('should extend ThrottlerGuard', () => {
    expect(guard).toBeInstanceOf(ThrottlerGuard);
  });

  describe('getTracker', () => {
    it('should return user-prefixed ID for authenticated requests', async () => {
      const req = { user: { sub: 'user-123-uuid' }, ip: '192.168.1.1' };
      const result = await (guard as any).getTracker(req);

      expect(result).toBe('user-user-123-uuid');
    });

    it('should fall back to IP for unauthenticated requests (no user)', async () => {
      const req = { ip: '10.0.0.1' };
      const parentGetTracker = jest
        .spyOn(ThrottlerGuard.prototype as any, 'getTracker')
        .mockResolvedValue('10.0.0.1');

      const result = await (guard as any).getTracker(req);

      expect(result).toBe('10.0.0.1');
      expect(parentGetTracker).toHaveBeenCalledWith(req);
      parentGetTracker.mockRestore();
    });

    it('should fall back to IP when user object has no sub', async () => {
      const req = { user: { email: 'test@test.com' }, ip: '172.16.0.1' };
      const parentGetTracker = jest
        .spyOn(ThrottlerGuard.prototype as any, 'getTracker')
        .mockResolvedValue('172.16.0.1');

      const result = await (guard as any).getTracker(req);

      expect(result).toBe('172.16.0.1');
      expect(parentGetTracker).toHaveBeenCalledWith(req);
      parentGetTracker.mockRestore();
    });

    it('should fall back to IP when user is undefined', async () => {
      const req = { user: undefined, ip: '192.168.0.50' };
      const parentGetTracker = jest
        .spyOn(ThrottlerGuard.prototype as any, 'getTracker')
        .mockResolvedValue('192.168.0.50');

      const result = await (guard as any).getTracker(req);

      expect(result).toBe('192.168.0.50');
      expect(parentGetTracker).toHaveBeenCalledWith(req);
      parentGetTracker.mockRestore();
    });

    it('should fall back to IP when user is null', async () => {
      const req = { user: null, ip: '10.10.10.10' };
      const parentGetTracker = jest
        .spyOn(ThrottlerGuard.prototype as any, 'getTracker')
        .mockResolvedValue('10.10.10.10');

      const result = await (guard as any).getTracker(req);

      expect(result).toBe('10.10.10.10');
      expect(parentGetTracker).toHaveBeenCalledWith(req);
      parentGetTracker.mockRestore();
    });

    it('should fall back to IP when sub is empty string', async () => {
      const req = { user: { sub: '' }, ip: '1.2.3.4' };
      const parentGetTracker = jest
        .spyOn(ThrottlerGuard.prototype as any, 'getTracker')
        .mockResolvedValue('1.2.3.4');

      const result = await (guard as any).getTracker(req);

      expect(result).toBe('1.2.3.4');
      expect(parentGetTracker).toHaveBeenCalledWith(req);
      parentGetTracker.mockRestore();
    });

    it('should fall back to IP when sub is not a string', async () => {
      const req = { user: { sub: 12345 }, ip: '5.6.7.8' };
      const parentGetTracker = jest
        .spyOn(ThrottlerGuard.prototype as any, 'getTracker')
        .mockResolvedValue('5.6.7.8');

      const result = await (guard as any).getTracker(req);

      expect(result).toBe('5.6.7.8');
      expect(parentGetTracker).toHaveBeenCalledWith(req);
      parentGetTracker.mockRestore();
    });

    it('should track different users independently on the same IP', async () => {
      const reqUser1 = { user: { sub: 'aaa-111' }, ip: '192.168.1.1' };
      const reqUser2 = { user: { sub: 'bbb-222' }, ip: '192.168.1.1' };

      const result1 = await (guard as any).getTracker(reqUser1);
      const result2 = await (guard as any).getTracker(reqUser2);

      expect(result1).toBe('user-aaa-111');
      expect(result2).toBe('user-bbb-222');
      expect(result1).not.toBe(result2);
    });
  });
});
