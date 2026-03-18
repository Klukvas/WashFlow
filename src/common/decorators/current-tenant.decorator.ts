import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../types/jwt-payload.type.js';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const tenantId: string | undefined = request.user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException(
        'Tenant context is required. Provide x-tenant-id header.',
      );
    }
    return tenantId;
  },
);
