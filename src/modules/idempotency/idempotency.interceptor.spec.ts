import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, firstValueFrom } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';

function makeCtx(
  headers: Record<string, string>,
  user?: { tenantId?: string },
  params?: { tenantSlug?: string },
): ExecutionContext {
  const request = { headers, user, params, method: 'POST', path: '/orders' };
  const response = { status: jest.fn(), statusCode: 201 };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(data: unknown = { id: '1' }): CallHandler {
  return { handle: () => of(data) };
}

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let idempotencyService: {
    check: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(() => {
    idempotencyService = {
      check: jest.fn().mockResolvedValue({ hit: false, cachedResponse: null }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    interceptor = new IdempotencyInterceptor(
      idempotencyService as unknown as IdempotencyService,
    );
  });

  it('should pass through when no idempotency-key header is provided', async () => {
    const ctx = makeCtx({}, { tenantId: 'tenant-1' });
    const handler = makeHandler({ id: '42' });
    const obs = await interceptor.intercept(ctx, handler);
    const result = await firstValueFrom(obs);
    expect(result).toEqual({ id: '42' });
    expect(idempotencyService.check).not.toHaveBeenCalled();
  });

  it('should pass through when tenantId cannot be resolved', async () => {
    const ctx = makeCtx({ 'idempotency-key': 'key-1' });
    const handler = makeHandler({ id: '99' });
    const obs = await interceptor.intercept(ctx, handler);
    const result = await firstValueFrom(obs);
    expect(result).toEqual({ id: '99' });
    expect(idempotencyService.check).not.toHaveBeenCalled();
  });

  it('should return cached response on cache hit', async () => {
    idempotencyService.check.mockResolvedValue({
      hit: true,
      cachedResponse: { statusCode: 200, body: { id: 'cached' } },
    });
    const ctx = makeCtx(
      { 'idempotency-key': 'key-1' },
      { tenantId: 'tenant-1' },
    );
    const handler = makeHandler({ id: 'new' });
    const obs = await interceptor.intercept(ctx, handler);
    const result = await firstValueFrom(obs);
    expect(result).toEqual({ id: 'cached' });
    expect(idempotencyService.save).not.toHaveBeenCalled();
  });

  it('should check idempotency with tenantId from user on cache miss', async () => {
    const ctx = makeCtx(
      { 'idempotency-key': 'key-abc' },
      { tenantId: 'tenant-x' },
    );
    const handler = makeHandler({});
    const obs = await interceptor.intercept(ctx, handler);
    await firstValueFrom(obs);
    expect(idempotencyService.check).toHaveBeenCalledWith(
      'slug:tenant-x',
      'key-abc',
    );
  });

  it('should resolve tenantId from params.tenantSlug when user has no tenantId', async () => {
    const ctx = makeCtx({ 'idempotency-key': 'key-slug' }, undefined, {
      tenantSlug: 'my-tenant',
    });
    const handler = makeHandler({});
    const obs = await interceptor.intercept(ctx, handler);
    await firstValueFrom(obs);
    expect(idempotencyService.check).toHaveBeenCalledWith(
      'slug:my-tenant',
      'key-slug',
    );
  });

  it('should save the response after handling on cache miss', async () => {
    const responseData = { id: 'new-order' };
    const ctx = makeCtx(
      { 'idempotency-key': 'key-1' },
      { tenantId: 'tenant-1' },
    );
    const handler = makeHandler(responseData);
    const obs = await interceptor.intercept(ctx, handler);
    await firstValueFrom(obs);
    expect(idempotencyService.save).toHaveBeenCalledWith(
      'slug:tenant-1',
      'key-1',
      expect.objectContaining({ body: responseData }),
    );
  });
});
