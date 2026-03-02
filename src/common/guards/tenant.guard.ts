import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtPayload } from '../types/jwt-payload.type.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
        if (!UUID_REGEX.test(headerTenantId)) {
          throw new BadRequestException(
            'x-tenant-id header must be a valid UUID',
          );
        }
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
