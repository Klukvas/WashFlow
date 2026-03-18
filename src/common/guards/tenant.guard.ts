import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ModuleRef } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { JwtPayload } from '../types/jwt-payload.type.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventDispatcherService } from '../events/event-dispatcher.service.js';
import { SuperAdminTenantAccessEvent } from '../events/auth-events.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);
  private prisma: PrismaService | null = null;
  private eventDispatcher: EventDispatcherService | null = null;

  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const user: JwtPayload | undefined = request.user;

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

        const prisma = this.getPrisma();
        const tenant = await prisma.tenant.findUnique({
          where: { id: headerTenantId },
        });
        if (!tenant) {
          throw new BadRequestException('Tenant not found');
        }

        (request as Request & { user: JwtPayload }).user = {
          ...user,
          tenantId: headerTenantId,
        };

        this.getEventDispatcher()?.dispatch(
          new SuperAdminTenantAccessEvent(headerTenantId, {
            superAdminId: user.sub,
            targetTenantId: headerTenantId,
          }),
        );
      }

      return true;
    }

    if (!user.tenantId) {
      throw new ForbiddenException('User is not associated with any tenant');
    }

    return true;
  }

  private getPrisma(): PrismaService {
    if (!this.prisma) {
      this.prisma = this.moduleRef.get(PrismaService, { strict: false });
    }
    return this.prisma!;
  }

  private getEventDispatcher(): EventDispatcherService | null {
    if (!this.eventDispatcher) {
      try {
        this.eventDispatcher = this.moduleRef.get(EventDispatcherService, {
          strict: false,
        });
      } catch (err) {
        this.logger.error(
          'EventDispatcherService unavailable',
          (err as Error).stack,
        );
        return null;
      }
    }
    return this.eventDispatcher;
  }
}
