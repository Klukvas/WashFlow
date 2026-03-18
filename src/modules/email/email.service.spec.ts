import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

describe('EmailService', () => {
  let service: EmailService;
  let mockSend: jest.Mock;

  const createService = async (apiKey: string = '') => {
    const configValues: Record<string, string> = {
      'resend.apiKey': apiKey,
      'resend.from': 'WashFlow <noreply@washflow.app>',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string, defaultValue?: string) =>
                configValues[key] ?? defaultValue ?? '',
            ),
          },
        },
      ],
    }).compile();

    return module.get<EmailService>(EmailService);
  };

  describe('without API key (no-op mode)', () => {
    beforeEach(async () => {
      service = await createService('');
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('sendPasswordResetEmail does not throw', async () => {
      await expect(
        service.sendPasswordResetEmail(
          'user@example.com',
          'https://example.com/reset',
          'John',
        ),
      ).resolves.toBeUndefined();
    });

    it('sendAccountLockedEmail does not throw', async () => {
      await expect(
        service.sendAccountLockedEmail('user@example.com', 'John'),
      ).resolves.toBeUndefined();
    });

    it('sendOrderConfirmation does not throw', async () => {
      await expect(
        service.sendOrderConfirmation('user@example.com', {
          orderNumber: '12345678',
          clientName: 'John Doe',
          vehicleInfo: 'Toyota Camry ABC123',
          scheduledDate: '2026-03-15T10:00:00Z',
          services: ['Exterior Wash'],
          totalPrice: '25.00',
        }),
      ).resolves.toBeUndefined();
    });

    it('sendStatusUpdate does not throw', async () => {
      await expect(
        service.sendStatusUpdate('user@example.com', {
          orderNumber: '12345678',
          clientName: 'John Doe',
          newStatus: 'IN_PROGRESS',
          vehicleInfo: 'Toyota Camry ABC123',
        }),
      ).resolves.toBeUndefined();
    });

    it('sendBookingReminder does not throw', async () => {
      await expect(
        service.sendBookingReminder('user@example.com', {
          orderNumber: '12345678',
          clientName: 'John Doe',
          scheduledDate: '2026-03-15T10:00:00Z',
          branchName: 'Main Branch',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('with API key', () => {
    beforeEach(async () => {
      mockSend = jest.fn().mockResolvedValue({ id: 'email-id' });

      service = await createService('re_test_api_key');

      // Access the private resend instance and mock emails.send
      (service as any).resend = { emails: { send: mockSend } };
    });

    it('sendPasswordResetEmail calls resend.emails.send with correct args', async () => {
      await service.sendPasswordResetEmail(
        'user@example.com',
        'https://example.com/reset',
        'John',
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        from: 'WashFlow <noreply@washflow.app>',
        to: 'user@example.com',
        subject: 'Reset Your Password — WashFlow',
        html: expect.stringContaining('https://example.com/reset'),
      });
    });

    it('sendAccountLockedEmail calls resend.emails.send', async () => {
      await service.sendAccountLockedEmail('user@example.com', 'John');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        from: 'WashFlow <noreply@washflow.app>',
        to: 'user@example.com',
        subject: 'Account Locked — WashFlow',
        html: expect.stringContaining('5 failed login attempts'),
      });
    });

    it('sendOrderConfirmation calls resend.emails.send', async () => {
      await service.sendOrderConfirmation('user@example.com', {
        orderNumber: '12345678',
        clientName: 'John Doe',
        vehicleInfo: 'Toyota Camry ABC123',
        scheduledDate: '2026-03-15T10:00:00Z',
        services: ['Exterior Wash', 'Interior Clean'],
        totalPrice: '45.00',
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        from: 'WashFlow <noreply@washflow.app>',
        to: 'user@example.com',
        subject: 'Order #12345678 Confirmed — WashFlow',
        html: expect.stringContaining('Order Confirmed'),
      });
    });

    it('sendStatusUpdate calls resend.emails.send', async () => {
      await service.sendStatusUpdate('user@example.com', {
        orderNumber: '12345678',
        clientName: 'John Doe',
        newStatus: 'IN_PROGRESS',
        vehicleInfo: 'Toyota Camry ABC123',
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        from: 'WashFlow <noreply@washflow.app>',
        to: 'user@example.com',
        subject: 'Order #12345678 Status Update — WashFlow',
        html: expect.stringContaining('IN_PROGRESS'),
      });
    });

    it('sendBookingReminder calls resend.emails.send', async () => {
      await service.sendBookingReminder('user@example.com', {
        orderNumber: '12345678',
        clientName: 'John Doe',
        scheduledDate: '2026-03-15T10:00:00Z',
        branchName: 'Main Branch',
        branchAddress: '123 Main St',
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        from: 'WashFlow <noreply@washflow.app>',
        to: 'user@example.com',
        subject: 'Booking Reminder — WashFlow',
        html: expect.stringContaining('Main Branch'),
      });
    });

    it('catches errors from resend.emails.send and does not throw', async () => {
      mockSend.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(
        service.sendPasswordResetEmail(
          'user@example.com',
          'https://example.com/reset',
          'John',
        ),
      ).resolves.toBeUndefined();

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });
});
