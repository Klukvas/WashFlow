import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import {
  passwordResetTemplate,
  accountLockedTemplate,
  orderConfirmationTemplate,
  statusUpdateTemplate,
  bookingReminderTemplate,
} from './email-templates';
import {
  OrderConfirmationData,
  StatusUpdateData,
  BookingReminderData,
} from './email.types';
import {
  CircuitBreaker,
  CircuitOpenError,
} from '../../common/utils/circuit-breaker';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('resend.apiKey', '');
    this.from = this.config.get<string>(
      'resend.from',
      'WashFlow <noreply@washflow.app>',
    );
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.circuitBreaker = new CircuitBreaker({
      name: 'Resend',
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
    });
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      this.logger.debug(
        `Email skipped (no API key): to=${to}, subject="${subject}"`,
      );
      return;
    }

    try {
      await this.circuitBreaker.fire(async () => {
        await this.resend!.emails.send({
          from: this.from,
          to,
          subject,
          html,
        });
      });
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        this.logger.warn(
          `Email deferred (circuit open): to=${to}, subject="${subject}"`,
        );
        return;
      }
      this.logger.error(
        `Failed to send email to ${to}: ${(error as Error).message}`,
      );
    }
  }

  async sendPasswordResetEmail(
    to: string,
    resetUrl: string,
    userName: string,
  ): Promise<void> {
    const html = passwordResetTemplate(resetUrl, userName);
    await this.send(to, 'Reset Your Password — WashFlow', html);
  }

  async sendAccountLockedEmail(to: string, userName: string): Promise<void> {
    const html = accountLockedTemplate(userName);
    await this.send(to, 'Account Locked — WashFlow', html);
  }

  async sendOrderConfirmation(
    to: string,
    data: OrderConfirmationData,
  ): Promise<void> {
    const html = orderConfirmationTemplate(data);
    await this.send(
      to,
      `Order #${data.orderNumber} Confirmed — WashFlow`,
      html,
    );
  }

  async sendStatusUpdate(to: string, data: StatusUpdateData): Promise<void> {
    const html = statusUpdateTemplate(data);
    await this.send(
      to,
      `Order #${data.orderNumber} Status Update — WashFlow`,
      html,
    );
  }

  async sendBookingReminder(
    to: string,
    data: BookingReminderData,
  ): Promise<void> {
    const html = bookingReminderTemplate(data);
    await this.send(to, 'Booking Reminder — WashFlow', html);
  }
}
