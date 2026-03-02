import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsProcessor } from './analytics.processor';
import { Job } from 'bullmq';

function makeJob(name: string, data: Record<string, unknown>): Job {
  return { name, data } as unknown as Job;
}

describe('AnalyticsProcessor', () => {
  let processor: AnalyticsProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalyticsProcessor],
    }).compile();

    processor = module.get<AnalyticsProcessor>(AnalyticsProcessor);
  });

  it('should process order-created job without error', async () => {
    const job = makeJob('order-created', { tenantId: 'tenant-1' });
    await expect(processor.process(job)).resolves.toBeUndefined();
  });

  it('should process order-completed job without error', async () => {
    const job = makeJob('order-completed', { tenantId: 'tenant-1' });
    await expect(processor.process(job)).resolves.toBeUndefined();
  });

  it('should handle unknown analytics job names without throwing', async () => {
    const job = makeJob('unknown-analytics', { tenantId: 'tenant-1' });
    await expect(processor.process(job)).resolves.toBeUndefined();
  });
});
