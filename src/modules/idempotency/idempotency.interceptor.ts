import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import type { JwtPayload } from '../../common/types/jwt-payload.type.js';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context
      .switchToHttp()
      .getRequest<
        Request & { user?: JwtPayload; params?: Record<string, string> }
      >();
    const response = context.switchToHttp().getResponse<Response>();
    const idempotencyKey = request.headers['idempotency-key'] as
      | string
      | undefined;

    if (
      !idempotencyKey ||
      idempotencyKey.length > 128 ||
      !/^[\w\-:.]+$/.test(idempotencyKey)
    ) {
      return next.handle();
    }

    const rawTenantId: string | undefined =
      request.user?.tenantId ??
      (request.params as Record<string, string> | undefined)?.['tenantSlug'];

    if (!rawTenantId) {
      return next.handle();
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUUID = uuidRegex.test(rawTenantId);
    const tenantKey = isUUID ? rawTenantId : `slug:${rawTenantId}`;

    const cached = await this.idempotencyService.check(
      tenantKey,
      idempotencyKey,
    );
    if (cached.hit && cached.cachedResponse) {
      response.status(cached.cachedResponse.statusCode);
      return of(cached.cachedResponse.body);
    }

    return next.handle().pipe(
      tap((data: unknown) => {
        void this.idempotencyService.save(tenantKey, idempotencyKey, {
          method: request.method,
          path: request.path,
          statusCode: response.statusCode || 201,
          body: data,
        });
      }),
    );
  }
}
