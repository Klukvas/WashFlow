import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

interface ExpressRoute {
  path?: string;
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const stopTimer = this.metricsService.httpRequestDuration.startTimer();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = ctx.getResponse<Response>();
          const route =
            (req.route as ExpressRoute | undefined)?.path ?? 'unknown';
          const labels = {
            method: req.method,
            route,
            status: String(res.statusCode),
          };
          stopTimer(labels);
          this.metricsService.httpRequestsTotal.inc(labels);
        },
        error: () => {
          const res = ctx.getResponse<Response>();
          const route =
            (req.route as ExpressRoute | undefined)?.path ?? 'unknown';
          const labels = {
            method: req.method,
            route,
            status: String(res.statusCode || 500),
          };
          stopTimer(labels);
          this.metricsService.httpRequestsTotal.inc(labels);
        },
      }),
    );
  }
}
