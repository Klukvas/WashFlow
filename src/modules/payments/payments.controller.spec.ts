import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { IdempotencyService } from '../idempotency/idempotency.service';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let service: Record<string, jest.Mock>;

  const tenantId = 'tenant-1';
  const orderId = 'order-1';

  beforeEach(async () => {
    service = {
      findByOrderId: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsController,
        { provide: PaymentsService, useValue: service },
        {
          provide: IdempotencyService,
          useValue: {
            check: jest.fn().mockResolvedValue({ hit: false }),
            save: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  describe('findByOrder', () => {
    it('should delegate to service.findByOrderId with tenantId and orderId', async () => {
      const expected = [{ id: 'pay-1', amount: 100 }];
      service.findByOrderId.mockResolvedValue(expected);
      const result = await controller.findByOrder(tenantId, orderId);
      expect(service.findByOrderId).toHaveBeenCalledWith(tenantId, orderId);
      expect(result).toEqual(expected);
    });
  });

  describe('create', () => {
    it('should delegate to service.create with tenantId, orderId, dto, and user.sub', async () => {
      const dto = { amount: 250, method: 'CASH' } as any;
      const user = { sub: 'user-123' };
      const expected = { id: 'pay-2', ...dto };
      service.create.mockResolvedValue(expected);
      const result = await controller.create(tenantId, orderId, dto, user);
      expect(service.create).toHaveBeenCalledWith(
        tenantId,
        orderId,
        dto,
        user.sub,
      );
      expect(result).toEqual(expected);
    });
  });
});
