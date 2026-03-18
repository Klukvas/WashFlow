import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Guards the /metrics endpoint.
 * - If METRICS_TOKEN env is set, requires `Authorization: Bearer <token>`.
 * - In production, METRICS_TOKEN is required — requests are rejected if not configured.
 * - In dev/test without METRICS_TOKEN, allows all requests.
 */
@Injectable()
export class MetricsAuthGuard implements CanActivate {
  private readonly token: string;
  private readonly isProduction: boolean;

  constructor(private readonly config: ConfigService) {
    this.token = this.config.get<string>('metricsToken', '');
    this.isProduction =
      this.config.get<string>('nodeEnv', 'development') === 'production';
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.token) {
      // In production, deny access if no token is configured
      return !this.isProduction;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization ?? '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    return bearer === this.token;
  }
}
