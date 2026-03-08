import { ExecutionContext } from '@nestjs/common';
import { CustomThrottlerGuard } from './custom-throttler.guard';

describe('CustomThrottlerGuard', () => {
  let guard: CustomThrottlerGuard;
  const mockContext = {} as ExecutionContext;

  beforeEach(() => {
    guard = Object.create(CustomThrottlerGuard.prototype);
  });

  describe('shouldSkip', () => {
    it('returns true when NODE_ENV is test', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const result = await (guard as any).shouldSkip(mockContext);

      expect(result).toBe(true);
      process.env.NODE_ENV = originalEnv;
    });

    it('returns false when NODE_ENV is production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const result = await (guard as any).shouldSkip(mockContext);

      expect(result).toBe(false);
      process.env.NODE_ENV = originalEnv;
    });

    it('returns false when NODE_ENV is development', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const result = await (guard as any).shouldSkip(mockContext);

      expect(result).toBe(false);
      process.env.NODE_ENV = originalEnv;
    });

    it('returns false when NODE_ENV is undefined', async () => {
      const originalEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

      const result = await (guard as any).shouldSkip(mockContext);

      expect(result).toBe(false);
      process.env.NODE_ENV = originalEnv;
    });
  });
});
