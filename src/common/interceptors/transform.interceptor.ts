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

interface PaginatedResponse {
  items: unknown;
  total: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

function isPaginatedResponse(value: unknown): value is PaginatedResponse {
  return (
    value !== null &&
    typeof value === 'object' &&
    'items' in value &&
    'total' in value
  );
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
      map((response: unknown) => {
        if (isPaginatedResponse(response)) {
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
