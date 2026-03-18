import { MetricsAuthGuard } from './metrics-auth.guard';

function makeContext(authHeader?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authHeader !== undefined ? { authorization: authHeader } : {},
      }),
    }),
  } as any;
}

function makeGuard(metricsToken: string) {
  const config = { get: jest.fn().mockReturnValue(metricsToken) };
  return new MetricsAuthGuard(config as any);
}

describe('MetricsAuthGuard', () => {
  it('returns true when no token is configured (dev mode)', () => {
    const guard = makeGuard('');
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('returns true for valid Bearer token', () => {
    const guard = makeGuard('secret-token');
    expect(guard.canActivate(makeContext('Bearer secret-token'))).toBe(true);
  });

  it('returns false for invalid Bearer token', () => {
    const guard = makeGuard('secret-token');
    expect(guard.canActivate(makeContext('Bearer wrong-token'))).toBe(false);
  });

  it('returns false when Authorization header is missing', () => {
    const guard = makeGuard('secret-token');
    expect(guard.canActivate(makeContext())).toBe(false);
  });

  it('returns false for non-Bearer format header', () => {
    const guard = makeGuard('secret-token');
    expect(guard.canActivate(makeContext('Basic dXNlcjpwYXNz'))).toBe(false);
  });
});
