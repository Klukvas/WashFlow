import { Test, TestingModule } from '@nestjs/testing';
import { Registry } from 'prom-client';
import { MetricsService } from './metrics.service';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  afterEach(() => {
    // Clear all registered metrics to prevent "already registered" errors
    service.registry.clear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // registry
  // -------------------------------------------------------------------------

  describe('registry', () => {
    it('is an instance of Registry', () => {
      expect(service.registry).toBeInstanceOf(Registry);
    });
  });

  // -------------------------------------------------------------------------
  // httpRequestDuration
  // -------------------------------------------------------------------------

  describe('httpRequestDuration', () => {
    it('is defined', () => {
      expect(service.httpRequestDuration).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // httpRequestsTotal
  // -------------------------------------------------------------------------

  describe('httpRequestsTotal', () => {
    it('is defined', () => {
      expect(service.httpRequestsTotal).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getMetrics()
  // -------------------------------------------------------------------------

  describe('getMetrics()', () => {
    it('returns a string', async () => {
      const metrics = await service.getMetrics();

      expect(typeof metrics).toBe('string');
    });

    it('includes the http_request_duration_seconds metric name', async () => {
      const metrics = await service.getMetrics();

      expect(metrics).toContain('http_request_duration_seconds');
    });

    it('includes the http_requests_total metric name', async () => {
      const metrics = await service.getMetrics();

      expect(metrics).toContain('http_requests_total');
    });
  });

  // -------------------------------------------------------------------------
  // getContentType()
  // -------------------------------------------------------------------------

  describe('getContentType()', () => {
    it('returns a string', () => {
      const contentType = service.getContentType();

      expect(typeof contentType).toBe('string');
    });

    it('returns the registry content type', () => {
      const contentType = service.getContentType();

      expect(contentType).toBe(service.registry.contentType);
    });
  });

  // -------------------------------------------------------------------------
  // onModuleInit()
  // -------------------------------------------------------------------------

  describe('onModuleInit()', () => {
    it('registers default metrics in the registry', async () => {
      // Before calling onModuleInit, get the initial metric count
      const metricsBefore = await service.getMetrics();

      service.onModuleInit();

      const metricsAfter = await service.getMetrics();

      // After collectDefaultMetrics, the output should contain more metric data
      expect(metricsAfter.length).toBeGreaterThan(metricsBefore.length);
    });

    it('registers default metrics that include process_cpu metric', async () => {
      service.onModuleInit();

      const metrics = await service.getMetrics();

      // collectDefaultMetrics adds process_cpu_* and other default metrics
      expect(metrics).toContain('process_cpu');
    });
  });
});
