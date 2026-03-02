import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { AnalyticsProducer } from './analytics.producer';

describe('AnalyticsProducer', () => {
  let producer: AnalyticsProducer;
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsProducer,
        { provide: getQueueToken('analytics'), useValue: queue },
      ],
    }).compile();

    producer = module.get<AnalyticsProducer>(AnalyticsProducer);
  });

  describe('recordOrderCreated', () => {
    it('should add order-created job with tenantId and orderData', async () => {
      const orderData = { id: 'order-1', totalPrice: 250 };
      await producer.recordOrderCreated('tenant-1', orderData);
      expect(queue.add).toHaveBeenCalledWith(
        'order-created',
        { tenantId: 'tenant-1', orderData },
        expect.objectContaining({ removeOnComplete: 200 }),
      );
    });
  });

  describe('recordOrderCompleted', () => {
    it('should add order-completed job with tenantId and orderData', async () => {
      const orderData = { id: 'order-2', totalPrice: 500 };
      await producer.recordOrderCompleted('tenant-1', orderData);
      expect(queue.add).toHaveBeenCalledWith(
        'order-completed',
        { tenantId: 'tenant-1', orderData },
        expect.objectContaining({ removeOnComplete: 200 }),
      );
    });
  });
});
