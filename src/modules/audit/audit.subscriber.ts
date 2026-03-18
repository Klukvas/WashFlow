import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditAction } from '@prisma/client';
import { AuditRepository } from './audit.repository';
import { EventType } from '../../common/events/event-types';
import { DomainEvent } from '../../common/events/domain-event';

@Injectable()
export class AuditSubscriber {
  private readonly logger = new Logger(AuditSubscriber.name);

  constructor(private readonly auditRepo: AuditRepository) {}

  @OnEvent(EventType.ORDER_CREATED)
  async handleOrderCreated(event: DomainEvent) {
    await this.log(
      event.tenantId,
      'Order',
      event.payload.id as string,
      AuditAction.CREATE,
      null,
      event.payload,
      undefined,
      { branchId: event.payload.branchId },
    );
  }

  @OnEvent(EventType.ORDER_STATUS_CHANGED)
  async handleOrderStatusChanged(event: DomainEvent) {
    await this.log(
      event.tenantId,
      'Order',
      event.payload.orderId as string,
      AuditAction.STATUS_CHANGE,
      { status: event.payload.previousStatus },
      { status: event.payload.newStatus },
      event.payload.userId as string,
      { branchId: event.payload.branchId },
    );
  }

  @OnEvent(EventType.ORDER_CANCELLED)
  async handleOrderCancelled(event: DomainEvent) {
    await this.log(
      event.tenantId,
      'Order',
      event.payload.orderId as string,
      AuditAction.STATUS_CHANGE,
      { status: event.payload.previousStatus || 'unknown' },
      { status: 'CANCELLED', reason: event.payload.reason },
      event.payload.userId as string,
      { branchId: event.payload.branchId },
    );
  }

  @OnEvent(EventType.CLIENT_DELETED)
  async handleClientDeleted(event: DomainEvent) {
    await this.log(
      event.tenantId,
      'Client',
      event.payload.clientId as string,
      AuditAction.DELETE,
      { name: event.payload.clientName },
      null,
      event.payload.performedById as string,
    );
  }

  @OnEvent(EventType.CLIENT_MERGED)
  async handleClientMerged(event: DomainEvent) {
    await this.log(
      event.tenantId,
      'Client',
      event.payload.targetClientId as string,
      AuditAction.MERGE,
      { mergedFromClientId: event.payload.sourceClientId },
      event.payload.fieldOverrides as Record<string, unknown>,
      event.payload.performedById as string,
    );
  }

  @OnEvent(EventType.AUTH_LOGIN)
  async handleAuthLogin(event: DomainEvent) {
    const email = event.payload.email as string;
    await this.log(
      event.tenantId,
      'Auth',
      event.payload.userId as string,
      AuditAction.CREATE,
      null,
      { action: 'login', email: email.replace(/(.{2}).*(@.*)/, '$1***$2') },
      event.payload.userId as string,
      { ip: event.payload.ip },
    );
  }

  @OnEvent(EventType.AUTH_LOGIN_FAILED)
  async handleAuthLoginFailed(event: DomainEvent) {
    const email = event.payload.email as string;
    await this.log(
      event.tenantId,
      'Auth',
      'login-failed',
      AuditAction.CREATE,
      null,
      {
        action: 'login_failed',
        email: email.replace(/(.{2}).*(@.*)/, '$1***$2'),
        reason: event.payload.reason,
      },
      undefined,
      { ip: event.payload.ip },
    );
  }

  @OnEvent(EventType.AUTH_PASSWORD_CHANGED)
  async handleAuthPasswordChanged(event: DomainEvent) {
    const email = event.payload.email as string;
    await this.log(
      event.tenantId,
      'Auth',
      event.payload.userId as string,
      AuditAction.UPDATE,
      null,
      {
        action: 'password_changed',
        email: email.replace(/(.{2}).*(@.*)/, '$1***$2'),
      },
      event.payload.userId as string,
    );
  }

  @OnEvent(EventType.AUTH_LOGOUT)
  async handleAuthLogout(event: DomainEvent) {
    await this.log(
      event.tenantId,
      'Auth',
      event.payload.userId as string,
      AuditAction.DELETE,
      null,
      { action: 'logout' },
      event.payload.userId as string,
    );
  }

  @OnEvent(EventType.SUPERADMIN_TENANT_ACCESS)
  async handleSuperAdminTenantAccess(event: DomainEvent) {
    await this.log(
      event.payload.targetTenantId as string,
      'Auth',
      event.payload.superAdminId as string,
      AuditAction.CREATE,
      null,
      {
        action: 'superadmin_tenant_access',
        targetTenantId: event.payload.targetTenantId,
      },
      event.payload.superAdminId as string,
    );
  }

  private async log(
    tenantId: string,
    entityType: string,
    entityId: string,
    action: AuditAction,
    oldValue: Record<string, unknown> | null,
    newValue: Record<string, unknown> | null,
    performedById?: string,
    metadata?: Record<string, unknown> | null,
  ) {
    try {
      await this.auditRepo.create({
        tenantId,
        entityType,
        entityId,
        action,
        oldValue,
        newValue,
        performedById: performedById || null,
        metadata: metadata || null,
      });
    } catch (error) {
      this.logger.error('Failed to create audit log', (error as Error).stack);
    }
  }
}
