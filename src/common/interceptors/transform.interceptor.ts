import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ResponseEnvelope<T> {
  data: T;
  meta: {
    timestamp: string;
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ResponseEnvelope<T>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseEnvelope<T>> {
    return next.handle().pipe(
      map((response) => {
        if (
          response &&
          typeof response === 'object' &&
          'items' in response &&
          'total' in response
        ) {
          return {
            data: response.items as T,
            meta: {
              timestamp: new Date().toISOString(),
              total: response.total,
              page: response.page,
              limit: response.limit,
              totalPages: response.totalPages,
            },
          };
        }

        return {
          data: response as T,
          meta: {
            timestamp: new Date().toISOString(),
          },
        };
      }),
    );
  }
}
