import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal ExecutionContext mock.
 * Both getHandler and getClass return distinct sentinel values so that the
 * reflector call can be verified with the exact arguments the guard passes.
 */
const buildContext = (): ExecutionContext =>
  ({
    getHandler: jest.fn().mockReturnValue('handler-sentinel'),
    getClass: jest.fn().mockReturnValue('class-sentinel'),
    switchToHttp: jest.fn(),
  }) as unknown as ExecutionContext;

const buildReflector = (): jest.Mocked<Reflector> =>
  ({ getAllAndOverride: jest.fn() }) as unknown as jest.Mocked<Reflector>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JwtAuthGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = buildReflector();
    guard = new JwtAuthGuard(reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Public routes
  // -------------------------------------------------------------------------

  describe('when the route is marked as public', () => {
    it('returns true without invoking super.canActivate', () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const superSpy = jest
        .spyOn(AuthGuard('jwt').prototype, 'canActivate')
        .mockReturnValue(false);

      const context = buildContext();
      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(superSpy).not.toHaveBeenCalled();

      superSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Non-public routes
  // -------------------------------------------------------------------------

  describe('when the route is NOT marked as public', () => {
    it('delegates to super.canActivate and returns its result', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const superSpy = jest
        .spyOn(AuthGuard('jwt').prototype, 'canActivate')
        .mockReturnValue(true);

      const context = buildContext();
      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(superSpy).toHaveBeenCalledWith(context);

      superSpy.mockRestore();
    });

    it('propagates a falsy result from super.canActivate', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const superSpy = jest
        .spyOn(AuthGuard('jwt').prototype, 'canActivate')
        .mockReturnValue(false);

      const context = buildContext();
      const result = guard.canActivate(context);

      expect(result).toBe(false);

      superSpy.mockRestore();
    });

    it('propagates a Promise returned by super.canActivate', async () => {
      reflector.getAllAndOverride.mockReturnValue(null);
      const superSpy = jest
        .spyOn(AuthGuard('jwt').prototype, 'canActivate')
        .mockReturnValue(Promise.resolve(true));

      const context = buildContext();
      const result = await guard.canActivate(context);

      expect(result).toBe(true);

      superSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Reflector usage
  // -------------------------------------------------------------------------

  describe('reflector.getAllAndOverride invocation', () => {
    it('is called with IS_PUBLIC_KEY as the metadata key', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      jest
        .spyOn(AuthGuard('jwt').prototype, 'canActivate')
        .mockReturnValue(true);

      const context = buildContext();
      void guard.canActivate(context);

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
        IS_PUBLIC_KEY,
        expect.any(Array),
      );
    });

    it('passes [handler, class] targets to reflector in that order', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      jest
        .spyOn(AuthGuard('jwt').prototype, 'canActivate')
        .mockReturnValue(true);

      const context = buildContext();
      void guard.canActivate(context);

      const [, targets] = reflector.getAllAndOverride.mock.calls[0];
      expect(targets).toEqual([context.getHandler(), context.getClass()]);
    });

    it('is called exactly once per canActivate invocation', () => {
      reflector.getAllAndOverride.mockReturnValue(true);

      const context = buildContext();
      void guard.canActivate(context);

      expect(reflector.getAllAndOverride).toHaveBeenCalledTimes(1);
    });
  });
});
