import { Test, TestingModule } from '@nestjs/testing';
import { AuditAction } from '@prisma/client';
import { AuditSubscriber } from './audit.subscriber';
import { AuditRepository } from './audit.repository';
import { DomainEvent } from '../../common/events/domain-event';

describe('AuditSubscriber', () => {
  let subscriber: AuditSubscriber;
  let auditRepo: { create: jest.Mock };

  const tenantId = 'tenant-1';

  function makeEvent(payload: Record<string, unknown>): DomainEvent {
    return { tenantId, payload } as DomainEvent;
  }

  beforeEach(async () => {
    auditRepo = { create: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditSubscriber,
        { provide: AuditRepository, useValue: auditRepo },
      ],
    }).compile();

    subscriber = module.get<AuditSubscriber>(AuditSubscriber);
  });

  describe('handleOrderCreated', () => {
    const event = makeEvent({
      id: 'order-1',
      branchId: 'branch-1',
      status: 'BOOKED',
    });

    it('should create an audit log with CREATE action', async () => {
      await subscriber.handleOrderCreated(event);
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          entityType: 'Order',
          entityId: 'order-1',
          action: AuditAction.CREATE,
          oldValue: null,
        }),
      );
    });

    it('should pass the full payload as newValue', async () => {
      await subscriber.handleOrderCreated(event);
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ newValue: event.payload }),
      );
    });

    it('should include branchId in metadata', async () => {
      await subscriber.handleOrderCreated(event);
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { branchId: 'branch-1' },
        }),
      );
    });
  });

  describe('handleOrderStatusChanged', () => {
    const event = makeEvent({
      orderId: 'order-2',
      previousStatus: 'BOOKED',
      newStatus: 'IN_PROGRESS',
      userId: 'user-1',
      branchId: 'branch-1',
    });

    it('should create an audit log with STATUS_CHANGE action', async () => {
      await subscriber.handleOrderStatusChanged(event);
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          entityType: 'Order',
          entityId: 'order-2',
          action: AuditAction.STATUS_CHANGE,
          oldValue: { status: 'BOOKED' },
          newValue: { status: 'IN_PROGRESS' },
          performedById: 'user-1',
        }),
      );
    });
  });

  describe('handleOrderCancelled', () => {
    const event = makeEvent({
      orderId: 'order-3',
      reason: 'Customer request',
      userId: 'user-2',
      branchId: 'branch-2',
    });

    it('should create an audit log with STATUS_CHANGE action and CANCELLED status', async () => {
      await subscriber.handleOrderCancelled(event);
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'order-3',
          action: AuditAction.STATUS_CHANGE,
          oldValue: null,
          newValue: { status: 'CANCELLED', reason: 'Customer request' },
          performedById: 'user-2',
        }),
      );
    });
  });

  describe('handleClientDeleted', () => {
    const event = makeEvent({
      clientId: 'client-1',
      clientName: 'John Doe',
      performedById: 'user-3',
    });

    it('should create an audit log with DELETE action', async () => {
      await subscriber.handleClientDeleted(event);
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Client',
          entityId: 'client-1',
          action: AuditAction.DELETE,
          oldValue: { name: 'John Doe' },
          newValue: null,
          performedById: 'user-3',
        }),
      );
    });
  });

  describe('handleClientMerged', () => {
    const event = makeEvent({
      targetClientId: 'client-2',
      sourceClientId: 'client-1',
      fieldOverrides: { phone: '0991234567' },
      performedById: 'user-4',
    });

    it('should create an audit log with MERGE action', async () => {
      await subscriber.handleClientMerged(event);
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Client',
          entityId: 'client-2',
          action: AuditAction.MERGE,
          oldValue: { mergedFromClientId: 'client-1' },
          newValue: { phone: '0991234567' },
          performedById: 'user-4',
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should not throw when auditRepo.create rejects', async () => {
      auditRepo.create.mockRejectedValue(new Error('DB error'));
      const event = makeEvent({ id: 'order-x', branchId: 'b' });
      await expect(subscriber.handleOrderCreated(event)).resolves.toBeUndefined();
    });

    it('should still call create only once when it fails', async () => {
      auditRepo.create.mockRejectedValue(new Error('DB error'));
      const event = makeEvent({ id: 'order-x', branchId: 'b' });
      await subscriber.handleOrderCreated(event).catch(() => undefined);
      expect(auditRepo.create).toHaveBeenCalledTimes(1);
    });
  });
});
