// Mock PrismaPg before importing PrismaService so the constructor won't
// try to establish a real connection.
const mockPrismaPg = jest.fn();
jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: mockPrismaPg,
}));

// Mock PrismaClient so `super()` doesn't require a real DB adapter
jest.mock('@prisma/client', () => ({
  PrismaClient: class MockPrismaClient {
    constructor(public opts?: any) {}
  },
}));

import { PrismaService } from './prisma.service';

function makeMockConfig(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    'database.url': 'postgresql://test:test@localhost:5432/test',
    nodeEnv: 'test',
  };
  const map = { ...defaults, ...overrides };
  return {
    get: jest.fn((key: string) => map[key]),
  };
}

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(() => {
    mockPrismaPg.mockClear();
    // Create instance without real DB — mock the parent methods
    service = Object.create(PrismaService.prototype);
    (service as any).$connect = jest.fn().mockResolvedValue(undefined);
    (service as any).$disconnect = jest.fn().mockResolvedValue(undefined);
    (service as any).logger = { log: jest.fn() };
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('calls $connect', async () => {
      await service.onModuleInit();

      expect((service as any).$connect).toHaveBeenCalled();
    });

    it('logs connection message', async () => {
      await service.onModuleInit();

      expect((service as any).logger.log).toHaveBeenCalledWith(
        'Connected to database',
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('calls $disconnect', async () => {
      await service.onModuleDestroy();

      expect((service as any).$disconnect).toHaveBeenCalled();
    });

    it('logs disconnection message', async () => {
      await service.onModuleDestroy();

      expect((service as any).logger.log).toHaveBeenCalledWith(
        'Disconnected from database',
      );
    });
  });

  describe('constructor', () => {
    it('creates PrismaPg adapter with database.url from config', () => {
      const mockConfig = makeMockConfig({
        'database.url': 'https://test-db:5432/washflow',
      });

      new PrismaService(mockConfig as any);

      expect(mockPrismaPg).toHaveBeenCalledWith({
        connectionString: 'https://test-db:5432/washflow',
        max: 15,
      });
    });

    it('uses error-only logging in production', () => {
      const mockConfig = makeMockConfig({ nodeEnv: 'production' });

      const svc = new PrismaService(mockConfig as any);

      expect((svc as any).opts?.log).toEqual(['error']);
    });

    it('uses verbose logging in development', () => {
      const mockConfig = makeMockConfig({ nodeEnv: 'development' });

      const svc = new PrismaService(mockConfig as any);

      expect((svc as any).opts?.log).toEqual(['info', 'warn', 'error']);
    });

    it('uses error-only logging in test env', () => {
      const mockConfig = makeMockConfig({ nodeEnv: 'test' });

      const svc = new PrismaService(mockConfig as any);

      expect((svc as any).opts?.log).toEqual(['error']);
    });
  });
});
