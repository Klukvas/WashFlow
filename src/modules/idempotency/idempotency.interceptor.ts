import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
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

    const tenantId: string | undefined =
      request.user?.tenantId || request.params?.tenantSlug;

    if (!tenantId) {
      return next.handle();
    }

    const cached = await this.idempotencyService.check(
      tenantId,
      idempotencyKey,
    );
    if (cached.hit && cached.cachedResponse) {
      response.status(cached.cachedResponse.statusCode);
      return of(cached.cachedResponse.body);
    }

    return next.handle().pipe(
      tap(async (data) => {
        await this.idempotencyService.save(tenantId, idempotencyKey, {
          method: request.method,
          path: request.path,
          statusCode: response.statusCode || 201,
          body: data,
        });
      }),
    );
  }
}
