import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOCK_METRICS_OUTPUT =
  '# HELP http_requests_total Total number of HTTP requests\n';
const MOCK_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('MetricsController', () => {
  let controller: MetricsController;
  let metricsService: {
    getMetrics: jest.Mock;
    getContentType: jest.Mock;
  };

  beforeEach(async () => {
    metricsService = {
      getMetrics: jest.fn().mockResolvedValue(MOCK_METRICS_OUTPUT),
      getContentType: jest.fn().mockReturnValue(MOCK_CONTENT_TYPE),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        { provide: MetricsService, useValue: metricsService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('') },
        },
      ],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // getMetrics()
  // -------------------------------------------------------------------------

  describe('getMetrics()', () => {
    let mockResponse: { set: jest.Mock; end: jest.Mock };

    beforeEach(() => {
      mockResponse = {
        set: jest.fn(),
        end: jest.fn(),
      };
    });

    it('calls metricsService.getMetrics()', async () => {
      await controller.getMetrics(mockResponse as any);

      expect(metricsService.getMetrics).toHaveBeenCalledTimes(1);
    });

    it('calls metricsService.getContentType()', async () => {
      await controller.getMetrics(mockResponse as any);

      expect(metricsService.getContentType).toHaveBeenCalledTimes(1);
    });

    it('sets Content-Type header on the response', async () => {
      await controller.getMetrics(mockResponse as any);

      expect(mockResponse.set).toHaveBeenCalledWith(
        'Content-Type',
        MOCK_CONTENT_TYPE,
      );
    });

    it('calls res.end() with the metrics string', async () => {
      await controller.getMetrics(mockResponse as any);

      expect(mockResponse.end).toHaveBeenCalledWith(MOCK_METRICS_OUTPUT);
    });

    it('propagates errors from metricsService.getMetrics()', async () => {
      metricsService.getMetrics.mockRejectedValue(new Error('Registry error'));

      await expect(controller.getMetrics(mockResponse as any)).rejects.toThrow(
        'Registry error',
      );
    });
  });
});
