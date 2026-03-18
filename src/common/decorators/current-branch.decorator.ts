import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../types/jwt-payload.type.js';

export const CurrentBranch = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    return request.user?.branchId ?? null;
  },
);
