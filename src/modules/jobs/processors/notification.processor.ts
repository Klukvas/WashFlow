import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';

interface NotificationJobData {
  orderId: string;
  tenantId: string;
}

@Processor('notifications')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    switch (job.name) {
      case 'order-confirmation':
        await this.handleOrderConfirmation(job.data);
        break;
      case 'status-update':
        await this.handleStatusUpdate(job.data);
        break;
      case 'booking-reminder':
        await this.handleBookingReminder(job.data);
        break;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleOrderConfirmation(data: {
    orderId: string;
    tenantId: string;
  }) {
    try {
      const order = await this.prisma.order.findFirst({
        where: { id: data.orderId, tenantId: data.tenantId },
        include: {
          client: true,
          vehicle: true,
          services: { include: { service: true } },
        },
      });

      if (!order || !order.client.email) return;

      await this.emailService.sendOrderConfirmation(order.client.email, {
        orderNumber: order.id.slice(0, 8),
        clientName:
          `${order.client.firstName} ${order.client.lastName ?? ''}`.trim(),
        vehicleInfo:
          `${order.vehicle.make} ${order.vehicle.model ?? ''} ${order.vehicle.licensePlate ?? ''}`.trim(),
        scheduledDate: new Date(order.scheduledStart).toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        services: order.services.map((s) => s.service.name),
        totalPrice: order.totalPrice.toString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to send order confirmation for orderId=${data.orderId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  private async handleStatusUpdate(data: {
    orderId: string;
    tenantId: string;
  }) {
    try {
      const order = await this.prisma.order.findFirst({
        where: { id: data.orderId, tenantId: data.tenantId },
        include: { client: true, vehicle: true },
      });

      if (!order || !order.client.email) return;

      await this.emailService.sendStatusUpdate(order.client.email, {
        orderNumber: order.id.slice(0, 8),
        clientName:
          `${order.client.firstName} ${order.client.lastName ?? ''}`.trim(),
        newStatus: order.status,
        vehicleInfo:
          `${order.vehicle.make} ${order.vehicle.model ?? ''} ${order.vehicle.licensePlate ?? ''}`.trim(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to send status update for orderId=${data.orderId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  private async handleBookingReminder(data: {
    orderId: string;
    tenantId: string;
  }) {
    try {
      const order = await this.prisma.order.findFirst({
        where: { id: data.orderId, tenantId: data.tenantId },
        include: { client: true, branch: true },
      });

      if (!order || !order.client.email) return;

      await this.emailService.sendBookingReminder(order.client.email, {
        orderNumber: order.id.slice(0, 8),
        clientName:
          `${order.client.firstName} ${order.client.lastName ?? ''}`.trim(),
        scheduledDate: new Date(order.scheduledStart).toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        branchName: order.branch.name,
        branchAddress: order.branch.address ?? undefined,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send booking reminder for orderId=${data.orderId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
