import { Test, TestingModule } from '@nestjs/testing';
import { NotificationProcessor } from './notification.processor';
import { Job } from 'bullmq';

function makeJob(name: string, data: Record<string, unknown>): Job {
  return { name, data } as unknown as Job;
}

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationProcessor],
    }).compile();

    processor = module.get<NotificationProcessor>(NotificationProcessor);
  });

  it('should process order-confirmation job without error', async () => {
    const job = makeJob('order-confirmation', {
      orderId: 'order-1',
      tenantId: 'tenant-1',
    });
    await expect(processor.process(job)).resolves.toBeUndefined();
  });

  it('should process status-update job without error', async () => {
    const job = makeJob('status-update', {
      orderId: 'order-2',
      tenantId: 'tenant-1',
    });
    await expect(processor.process(job)).resolves.toBeUndefined();
  });

  it('should process booking-reminder job without error', async () => {
    const job = makeJob('booking-reminder', {
      orderId: 'order-3',
      tenantId: 'tenant-1',
    });
    await expect(processor.process(job)).resolves.toBeUndefined();
  });

  it('should handle unknown job names without throwing', async () => {
    const job = makeJob('unknown-job', { tenantId: 'tenant-1' });
    await expect(processor.process(job)).resolves.toBeUndefined();
  });
});
