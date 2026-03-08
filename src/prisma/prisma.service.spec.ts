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
    it('creates PrismaPg adapter with DATABASE_URL from env', () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'https://test-db:5432/washflow';

      new PrismaService();

      expect(mockPrismaPg).toHaveBeenCalledWith({
        connectionString: 'https://test-db:5432/washflow',
      });
      process.env.DATABASE_URL = originalUrl;
    });

    it('uses error-only logging in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const svc = new PrismaService();

      expect((svc as any).opts?.log).toEqual(['error']);
      process.env.NODE_ENV = originalEnv;
    });

    it('uses verbose logging in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const svc = new PrismaService();

      expect((svc as any).opts?.log).toEqual(['info', 'warn', 'error']);
      process.env.NODE_ENV = originalEnv;
    });

    it('uses error-only logging in test env', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const svc = new PrismaService();

      expect((svc as any).opts?.log).toEqual(['error']);
      process.env.NODE_ENV = originalEnv;
    });
  });
});
