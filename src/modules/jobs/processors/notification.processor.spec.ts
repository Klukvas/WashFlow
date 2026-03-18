import { Test, TestingModule } from '@nestjs/testing';
import { NotificationProcessor } from './notification.processor';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { Job } from 'bullmq';

function makeJob(name: string, data: Record<string, unknown>): Job {
  return { name, data } as unknown as Job;
}

const mockPrisma = {
  order: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
};

const mockEmailService = {
  sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
  sendStatusUpdate: jest.fn().mockResolvedValue(undefined),
  sendBookingReminder: jest.fn().mockResolvedValue(undefined),
};

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: mockEmailService },
      ],
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

  it('should send order confirmation email when order and client email exist', async () => {
    const order = {
      id: 'abc12345-long-id',
      client: { email: 'test@example.com', firstName: 'John', lastName: 'Doe' },
      vehicle: { make: 'Toyota', model: 'Camry', licensePlate: 'AB1234' },
      scheduledStart: new Date('2026-01-15T10:00:00Z'),
      services: [{ service: { name: 'Car Wash' } }],
      totalPrice: '100.00',
    };
    mockPrisma.order.findFirst.mockResolvedValueOnce(order);

    const job = makeJob('order-confirmation', {
      orderId: 'order-1',
      tenantId: 'tenant-1',
    });
    await processor.process(job);

    expect(mockEmailService.sendOrderConfirmation).toHaveBeenCalledWith(
      'test@example.com',
      expect.objectContaining({
        orderNumber: 'abc12345',
        clientName: 'John Doe',
        services: ['Car Wash'],
      }),
    );
  });

  it('should skip email when order not found', async () => {
    mockPrisma.order.findFirst.mockResolvedValueOnce(null);

    const job = makeJob('order-confirmation', {
      orderId: 'order-1',
      tenantId: 'tenant-1',
    });
    await processor.process(job);

    expect(mockEmailService.sendOrderConfirmation).not.toHaveBeenCalled();
  });

  it('should skip email when client has no email', async () => {
    const order = {
      id: 'abc12345',
      client: { email: null, firstName: 'John', lastName: null },
      vehicle: { make: 'Toyota', model: null, licensePlate: null },
      scheduledStart: new Date(),
      services: [],
      totalPrice: '0',
    };
    mockPrisma.order.findFirst.mockResolvedValueOnce(order);

    const job = makeJob('order-confirmation', {
      orderId: 'order-1',
      tenantId: 'tenant-1',
    });
    await processor.process(job);

    expect(mockEmailService.sendOrderConfirmation).not.toHaveBeenCalled();
  });

  describe('status-update', () => {
    it('calls sendStatusUpdate with correct args when order has a client email', async () => {
      const order = {
        id: 'statusid-long',
        status: 'COMPLETED',
        client: {
          email: 'client@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
        },
        vehicle: { make: 'BMW', model: 'X5', licensePlate: 'XY9999' },
      };
      mockPrisma.order.findFirst.mockResolvedValueOnce(order);

      const job = makeJob('status-update', {
        orderId: 'statusid-long',
        tenantId: 'tenant-1',
      });
      await processor.process(job);

      expect(mockEmailService.sendStatusUpdate).toHaveBeenCalledWith(
        'client@example.com',
        expect.objectContaining({
          orderNumber: 'statusid',
          clientName: 'Jane Smith',
          newStatus: 'COMPLETED',
          vehicleInfo: 'BMW X5 XY9999',
        }),
      );
    });

    it('skips sendStatusUpdate when order client has no email', async () => {
      const order = {
        id: 'statusid-long',
        status: 'IN_PROGRESS',
        client: { email: null, firstName: 'Jane', lastName: 'Smith' },
        vehicle: { make: 'BMW', model: 'X5', licensePlate: 'XY9999' },
      };
      mockPrisma.order.findFirst.mockResolvedValueOnce(order);

      const job = makeJob('status-update', {
        orderId: 'statusid-long',
        tenantId: 'tenant-1',
      });
      await processor.process(job);

      expect(mockEmailService.sendStatusUpdate).not.toHaveBeenCalled();
    });
  });

  describe('booking-reminder', () => {
    it('calls sendBookingReminder with branchName and branchAddress when order has client email', async () => {
      const order = {
        id: 'reminderid-long',
        scheduledStart: new Date('2026-03-20T09:00:00Z'),
        client: {
          email: 'remind@example.com',
          firstName: 'Alex',
          lastName: 'Brown',
        },
        branch: { name: 'Main Branch', address: '123 Main St' },
      };
      mockPrisma.order.findFirst.mockResolvedValueOnce(order);

      const job = makeJob('booking-reminder', {
        orderId: 'reminderid-long',
        tenantId: 'tenant-1',
      });
      await processor.process(job);

      expect(mockEmailService.sendBookingReminder).toHaveBeenCalledWith(
        'remind@example.com',
        expect.objectContaining({
          orderNumber: 'reminder',
          clientName: 'Alex Brown',
          scheduledDate: new Date(order.scheduledStart).toLocaleString(
            'en-US',
            { dateStyle: 'medium', timeStyle: 'short' },
          ),
          branchName: 'Main Branch',
          branchAddress: '123 Main St',
        }),
      );
    });

    it('passes undefined branchAddress when branch has no address', async () => {
      const order = {
        id: 'reminderid-long',
        scheduledStart: new Date('2026-03-20T09:00:00Z'),
        client: {
          email: 'remind@example.com',
          firstName: 'Alex',
          lastName: 'Brown',
        },
        branch: { name: 'Main Branch', address: null },
      };
      mockPrisma.order.findFirst.mockResolvedValueOnce(order);

      const job = makeJob('booking-reminder', {
        orderId: 'reminderid-long',
        tenantId: 'tenant-1',
      });
      await processor.process(job);

      expect(mockEmailService.sendBookingReminder).toHaveBeenCalledWith(
        'remind@example.com',
        expect.objectContaining({
          branchName: 'Main Branch',
          branchAddress: undefined,
        }),
      );
    });

    it('skips sendBookingReminder when order client has no email', async () => {
      const order = {
        id: 'reminderid-long',
        scheduledStart: new Date('2026-03-20T09:00:00Z'),
        client: { email: null, firstName: 'Alex', lastName: 'Brown' },
        branch: { name: 'Main Branch', address: '123 Main St' },
      };
      mockPrisma.order.findFirst.mockResolvedValueOnce(order);

      const job = makeJob('booking-reminder', {
        orderId: 'reminderid-long',
        tenantId: 'tenant-1',
      });
      await processor.process(job);

      expect(mockEmailService.sendBookingReminder).not.toHaveBeenCalled();
    });
  });
});
