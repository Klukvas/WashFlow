import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { JwtPayload } from '../types/jwt-payload.type.js';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;

    if (!user) {
      throw new ForbiddenException('No authenticated user found');
    }

    if (user.isSuperAdmin) {
      const headerTenantId = request.headers['x-tenant-id'] as
        | string
        | undefined;

      if (headerTenantId) {
        request.user = { ...user, tenantId: headerTenantId };
      }

      return true;
    }

    if (!user.tenantId) {
      throw new ForbiddenException('User is not associated with any tenant');
    }

    return true;
  }
}
