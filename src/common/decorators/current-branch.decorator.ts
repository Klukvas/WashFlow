import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentBranch = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.branchId ?? null;
  },
);
