import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsExportService } from './analytics-export.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

describe('AnalyticsExportService', () => {
  let service: AnalyticsExportService;
  let prisma: {
    order: { findMany: jest.Mock };
    client: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      order: { findMany: jest.fn().mockResolvedValue([]) },
      client: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsExportService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AnalyticsExportService>(AnalyticsExportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('exportOrdersCsv', () => {
    const query: AnalyticsQueryDto = {};

    it('should return CSV string with headers', async () => {
      const csv = await service.exportOrdersCsv('tenant-1', query);
      const firstLine = csv.split('\n')[0];
      expect(firstLine).toContain('Order ID');
      expect(firstLine).toContain('Date');
      expect(firstLine).toContain('Status');
      expect(firstLine).toContain('Total Price');
    });

    it('should include order data in rows', async () => {
      prisma.order.findMany.mockResolvedValue([
        {
          id: 'order-1',
          scheduledStart: new Date('2026-01-15T10:00:00Z'),
          status: 'COMPLETED',
          totalPrice: { toString: () => '150.00' },
          source: 'INTERNAL',
          client: {
            firstName: 'John',
            lastName: 'Doe',
            phone: '+380501234567',
            email: 'john@example.com',
          },
          vehicle: {
            make: 'Toyota',
            model: 'Camry',
            licensePlate: 'AA1234BB',
          },
          branch: { name: 'Main Branch' },
          services: [
            { service: { name: 'Full Wash' } },
            { service: { name: 'Interior Cleaning' } },
          ],
        },
      ]);

      const csv = await service.exportOrdersCsv('tenant-1', query);
      const lines = csv.split('\n');

      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('order-1');
      expect(lines[1]).toContain('John Doe');
      expect(lines[1]).toContain('Toyota Camry');
      expect(lines[1]).toContain('Main Branch');
      expect(lines[1]).toContain('150.00');
    });

    it('should return just headers for empty results', async () => {
      const csv = await service.exportOrdersCsv('tenant-1', query);
      const lines = csv.split('\n');

      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('Order ID');
    });
  });

  describe('exportClientsCsv', () => {
    const query: AnalyticsQueryDto = {};

    it('should return CSV string with headers', async () => {
      const csv = await service.exportClientsCsv('tenant-1', query);
      const firstLine = csv.split('\n')[0];
      expect(firstLine).toContain('Client ID');
      expect(firstLine).toContain('First Name');
      expect(firstLine).toContain('Total Revenue');
    });

    it('should include client data in rows', async () => {
      prisma.client.findMany.mockResolvedValue([
        {
          id: 'client-1',
          firstName: 'Jane',
          lastName: 'Smith',
          phone: '+380509876543',
          email: 'jane@example.com',
          createdAt: new Date('2025-12-01T08:00:00Z'),
          vehicles: [{ id: 'v1' }, { id: 'v2' }],
          orders: [
            {
              id: 'o1',
              totalPrice: { toString: () => '100.00' },
              status: 'COMPLETED',
            },
            {
              id: 'o2',
              totalPrice: { toString: () => '200.00' },
              status: 'COMPLETED',
            },
            {
              id: 'o3',
              totalPrice: { toString: () => '50.00' },
              status: 'CANCELLED',
            },
          ],
        },
      ]);

      const csv = await service.exportClientsCsv('tenant-1', query);
      const lines = csv.split('\n');

      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('client-1');
      expect(lines[1]).toContain('Jane');
      expect(lines[1]).toContain('Smith');
      expect(lines[1]).toContain('2'); // vehicles count
      expect(lines[1]).toContain('3'); // total orders
      expect(lines[1]).toContain('300.00'); // total revenue from completed
    });

    it('should return just headers for empty results', async () => {
      const csv = await service.exportClientsCsv('tenant-1', query);
      const lines = csv.split('\n');

      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('Client ID');
    });
  });

  describe('exportOrdersCsv — date filters', () => {
    it('includes gte when dateFrom is provided', async () => {
      await service.exportOrdersCsv('t1', { dateFrom: '2026-01-01' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            scheduledStart: expect.objectContaining({
              gte: new Date('2026-01-01'),
            }),
          }),
        }),
      );
    });

    it('includes lte when dateTo is provided', async () => {
      await service.exportOrdersCsv('t1', { dateTo: '2026-02-01' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            scheduledStart: expect.objectContaining({
              lte: new Date('2026-02-01'),
            }),
          }),
        }),
      );
    });

    it('merges both gte and lte when both dates provided', async () => {
      await service.exportOrdersCsv('t1', {
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01',
      });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            scheduledStart: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-02-01'),
            },
          }),
        }),
      );
    });

    it('includes branchId in where when provided', async () => {
      await service.exportOrdersCsv('t1', {}, 'branch-1');

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: 'branch-1' }),
        }),
      );
    });
  });

  describe('exportClientsCsv — branchId filter', () => {
    it('filters orders by branchId when provided', async () => {
      prisma.client.findMany.mockResolvedValue([]);

      await service.exportClientsCsv('t1', {}, 'branch-1');

      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            orders: expect.objectContaining({
              where: { branchId: 'branch-1', deletedAt: null },
            }),
          }),
        }),
      );
    });
  });

  describe('exportOrdersCsv — null optional fields', () => {
    it('handles null lastName, phone, email, model, licensePlate', async () => {
      prisma.order.findMany.mockResolvedValue([
        {
          id: 'order-1',
          scheduledStart: new Date('2026-01-15T10:00:00Z'),
          status: 'PENDING',
          totalPrice: { toString: () => '50.00' },
          source: 'ONLINE',
          client: {
            firstName: 'Solo',
            lastName: null,
            phone: null,
            email: null,
          },
          vehicle: { make: 'BMW', model: null, licensePlate: null },
          branch: { name: 'Main' },
          services: [],
        },
      ]);

      const csv = await service.exportOrdersCsv('t1', {});
      const lines = csv.split('\n');

      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('Solo');
      expect(lines[1]).toContain('BMW');
    });
  });

  describe('exportClientsCsv — edge cases', () => {
    it('returns revenue 0.00 for client with zero completed orders', async () => {
      prisma.client.findMany.mockResolvedValue([
        {
          id: 'c1',
          firstName: 'A',
          lastName: 'B',
          phone: '123',
          email: 'a@b.com',
          createdAt: new Date('2026-01-01'),
          vehicles: [],
          orders: [
            {
              id: 'o1',
              totalPrice: { toString: () => '100' },
              status: 'CANCELLED',
            },
          ],
        },
      ]);

      const csv = await service.exportClientsCsv('t1', {});
      const lines = csv.split('\n');

      expect(lines[1]).toContain('0.00');
    });

    it('handles null optional client fields', async () => {
      prisma.client.findMany.mockResolvedValue([
        {
          id: 'c1',
          firstName: 'Solo',
          lastName: null,
          phone: null,
          email: null,
          createdAt: new Date('2026-01-01'),
          vehicles: [],
          orders: [],
        },
      ]);

      const csv = await service.exportClientsCsv('t1', {});
      const lines = csv.split('\n');

      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('Solo');
    });
  });

  describe('CSV escaping', () => {
    it('should quote fields with commas', async () => {
      prisma.order.findMany.mockResolvedValue([
        {
          id: 'order-1',
          scheduledStart: new Date('2026-01-15T10:00:00Z'),
          status: 'COMPLETED',
          totalPrice: { toString: () => '150.00' },
          source: 'INTERNAL',
          client: {
            firstName: 'John',
            lastName: 'Doe, Jr.',
            phone: '',
            email: '',
          },
          vehicle: {
            make: 'Toyota',
            model: 'Camry',
            licensePlate: '',
          },
          branch: { name: 'Branch A' },
          services: [],
        },
      ]);

      const csv = await service.exportOrdersCsv('tenant-1', {});
      expect(csv).toContain('"John Doe, Jr."');
    });

    it('should double-quote fields with quotes', async () => {
      prisma.order.findMany.mockResolvedValue([
        {
          id: 'order-1',
          scheduledStart: new Date('2026-01-15T10:00:00Z'),
          status: 'COMPLETED',
          totalPrice: { toString: () => '150.00' },
          source: 'INTERNAL',
          client: {
            firstName: 'The "Boss"',
            lastName: '',
            phone: '',
            email: '',
          },
          vehicle: {
            make: 'Toyota',
            model: 'Camry',
            licensePlate: '',
          },
          branch: { name: 'Branch A' },
          services: [],
        },
      ]);

      const csv = await service.exportOrdersCsv('tenant-1', {});
      expect(csv).toContain('"The ""Boss"""');
    });
  });
});
