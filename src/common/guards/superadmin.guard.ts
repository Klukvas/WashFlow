import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import type { JwtPayload } from '../types/jwt-payload.type.js';

/**
 * Guard that restricts access to super-admins only.
 * Apply at the controller or handler level: @UseGuards(SuperAdminGuard)
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;

    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('Super-admin access required');
    }

    return true;
  }
}
