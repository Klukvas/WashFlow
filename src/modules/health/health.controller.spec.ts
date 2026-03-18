import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisHealthIndicator } from './redis-health.indicator';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: { check: jest.Mock };

  beforeEach(async () => {
    healthService = {
      check: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthService },
        {
          provide: PrismaHealthIndicator,
          useValue: {
            pingCheck: jest
              .fn()
              .mockResolvedValue({ database: { status: 'up' } }),
          },
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: RedisHealthIndicator,
          useValue: {
            isHealthy: jest.fn().mockResolvedValue({ redis: { status: 'up' } }),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('returns healthy status when all services are up', async () => {
      const healthResult = {
        status: 'ok',
        info: { database: { status: 'up' }, redis: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' }, redis: { status: 'up' } },
      };
      healthService.check.mockResolvedValue(healthResult);

      const result = await controller.check();

      expect(result).toEqual(healthResult);
      expect(healthService.check).toHaveBeenCalledWith([
        expect.any(Function),
        expect.any(Function),
      ]);
    });

    it('propagates error when health check fails', async () => {
      healthService.check.mockRejectedValue(
        new Error('Database is not reachable'),
      );

      await expect(controller.check()).rejects.toThrow(
        'Database is not reachable',
      );
    });

    it('passes both database and redis indicator functions to health check', async () => {
      healthService.check.mockResolvedValue({ status: 'ok' });

      await controller.check();

      const checkArgs = healthService.check.mock.calls[0][0];
      expect(checkArgs).toHaveLength(2);
      expect(typeof checkArgs[0]).toBe('function');
      expect(typeof checkArgs[1]).toBe('function');
    });
  });
});
