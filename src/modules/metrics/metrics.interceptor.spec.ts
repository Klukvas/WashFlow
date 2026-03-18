import { of, throwError } from 'rxjs';
import { MetricsInterceptor } from './metrics.interceptor';

function buildMocks() {
  const stopTimer = jest.fn();
  const metricsService = {
    httpRequestDuration: { startTimer: jest.fn().mockReturnValue(stopTimer) },
    httpRequestsTotal: { inc: jest.fn() },
  };

  const req: Record<string, unknown> = {
    method: 'GET',
    path: '/api/v1/orders',
    route: { path: '/api/v1/orders' },
  };

  const res: Record<string, unknown> = { statusCode: 200 };

  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  };

  return {
    metricsService,
    stopTimer,
    req,
    res,
    context,
    interceptor: new MetricsInterceptor(metricsService as any),
  };
}

describe('MetricsInterceptor', () => {
  it('records duration and increments counter on success', (done) => {
    const { interceptor, context, stopTimer, metricsService } = buildMocks();
    const next = { handle: () => of('result') };

    interceptor.intercept(context as any, next as any).subscribe({
      complete: () => {
        const expectedLabels = {
          method: 'GET',
          route: '/api/v1/orders',
          status: '200',
        };
        expect(stopTimer).toHaveBeenCalledWith(expectedLabels);
        expect(metricsService.httpRequestsTotal.inc).toHaveBeenCalledWith(
          expectedLabels,
        );
        done();
      },
    });
  });

  it('records duration and increments counter on error with status 500 fallback', (done) => {
    const { interceptor, context, stopTimer, metricsService, res } =
      buildMocks();
    (res as any).statusCode = 0; // falsy → should fallback to 500
    const next = { handle: () => throwError(() => new Error('fail')) };

    interceptor.intercept(context as any, next as any).subscribe({
      error: () => {
        const expectedLabels = {
          method: 'GET',
          route: '/api/v1/orders',
          status: '500',
        };
        expect(stopTimer).toHaveBeenCalledWith(expectedLabels);
        expect(metricsService.httpRequestsTotal.inc).toHaveBeenCalledWith(
          expectedLabels,
        );
        done();
      },
    });
  });

  it('uses req.route.path when available', (done) => {
    const { interceptor, context, stopTimer, req } = buildMocks();
    req.route = { path: '/api/v1/orders/:id' };
    const next = { handle: () => of('ok') };

    interceptor.intercept(context as any, next as any).subscribe({
      complete: () => {
        expect(stopTimer).toHaveBeenCalledWith(
          expect.objectContaining({ route: '/api/v1/orders/:id' }),
        );
        done();
      },
    });
  });

  it('falls back to "unknown" when req.route is undefined', (done) => {
    const { interceptor, context, stopTimer, req } = buildMocks();
    delete req.route;
    const next = { handle: () => of('ok') };

    interceptor.intercept(context as any, next as any).subscribe({
      complete: () => {
        expect(stopTimer).toHaveBeenCalledWith(
          expect.objectContaining({ route: 'unknown' }),
        );
        done();
      },
    });
  });

  it('uses response statusCode on success', (done) => {
    const { interceptor, context, stopTimer, res } = buildMocks();
    (res as any).statusCode = 201;
    const next = { handle: () => of('created') };

    interceptor.intercept(context as any, next as any).subscribe({
      complete: () => {
        expect(stopTimer).toHaveBeenCalledWith(
          expect.objectContaining({ status: '201' }),
        );
        done();
      },
    });
  });

  it('uses response statusCode on error when it is truthy', (done) => {
    const { interceptor, context, stopTimer, res } = buildMocks();
    (res as any).statusCode = 404;
    const next = { handle: () => throwError(() => new Error('not found')) };

    interceptor.intercept(context as any, next as any).subscribe({
      error: () => {
        expect(stopTimer).toHaveBeenCalledWith(
          expect.objectContaining({ status: '404' }),
        );
        done();
      },
    });
  });
});
