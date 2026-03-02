import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyCleanupService } from './idempotency-cleanup.service';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyCleanupService', () => {
  let service: IdempotencyCleanupService;
  let idempotencyService: { cleanExpired: jest.Mock };

  beforeEach(async () => {
    idempotencyService = {
      cleanExpired: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyCleanupService,
        { provide: IdempotencyService, useValue: idempotencyService },
      ],
    }).compile();

    service = module.get<IdempotencyCleanupService>(IdempotencyCleanupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleCleanup', () => {
    it('should call idempotencyService.cleanExpired', async () => {
      idempotencyService.cleanExpired.mockResolvedValue({ count: 0 });

      await service.handleCleanup();

      expect(idempotencyService.cleanExpired).toHaveBeenCalledTimes(1);
    });

    it('should log the number of deleted keys returned by cleanExpired', async () => {
      idempotencyService.cleanExpired.mockResolvedValue({ count: 7 });
      const logSpy = jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => undefined);

      await service.handleCleanup();

      const logCalls = logSpy.mock.calls.map((args) => args[0] as string);
      const summaryLog = logCalls.find((msg) => msg.includes('7'));
      expect(summaryLog).toBeDefined();
    });

    it('should log a start message before calling cleanExpired', async () => {
      idempotencyService.cleanExpired.mockResolvedValue({ count: 0 });
      const logSpy = jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => undefined);

      await service.handleCleanup();

      expect(logSpy).toHaveBeenCalledTimes(2);
      const firstLog = logSpy.mock.calls[0][0] as string;
      expect(firstLog.toLowerCase()).toContain('clean');
    });

    it('should handle cleanExpired returning count 0 without error', async () => {
      idempotencyService.cleanExpired.mockResolvedValue({ count: 0 });

      await expect(service.handleCleanup()).resolves.toBeUndefined();
    });

    it('should handle cleanExpired returning a large count', async () => {
      idempotencyService.cleanExpired.mockResolvedValue({ count: 100000 });
      const logSpy = jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => undefined);

      await service.handleCleanup();

      const logCalls = logSpy.mock.calls.map((args) => args[0] as string);
      const summaryLog = logCalls.find((msg) => msg.includes('100000'));
      expect(summaryLog).toBeDefined();
    });
  });
});
