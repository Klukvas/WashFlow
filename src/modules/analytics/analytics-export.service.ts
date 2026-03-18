import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@Injectable()
export class AnalyticsExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportOrdersCsv(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId?: string | null,
  ): Promise<string> {
    const where: Record<string, unknown> = { tenantId, deletedAt: null };
    if (branchId) where.branchId = branchId;
    if (query.dateFrom) {
      where.scheduledStart = {
        ...((where.scheduledStart as object) ?? {}),
        gte: new Date(query.dateFrom),
      };
    }
    if (query.dateTo) {
      where.scheduledStart = {
        ...((where.scheduledStart as object) ?? {}),
        lte: new Date(query.dateTo),
      };
    }

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        client: true,
        vehicle: true,
        branch: true,
        services: { include: { service: true } },
      },
      orderBy: { scheduledStart: 'desc' },
      take: 10000,
    });

    const headers = [
      'Order ID',
      'Date',
      'Status',
      'Client Name',
      'Client Phone',
      'Client Email',
      'Vehicle',
      'License Plate',
      'Branch',
      'Services',
      'Total Price',
      'Source',
    ];

    const rows = orders.map((order) => [
      order.id,
      order.scheduledStart.toISOString(),
      order.status,
      `${order.client.firstName} ${order.client.lastName ?? ''}`.trim(),
      order.client.phone ?? '',
      order.client.email ?? '',
      `${order.vehicle.make} ${order.vehicle.model ?? ''}`.trim(),
      order.vehicle.licensePlate ?? '',
      order.branch.name,
      order.services.map((s) => s.service.name).join('; '),
      order.totalPrice.toString(),
      order.source,
    ]);

    return toCsv(headers, rows);
  }

  async exportClientsCsv(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId?: string | null,
  ): Promise<string> {
    const where: Record<string, unknown> = { tenantId, deletedAt: null };

    const clients = await this.prisma.client.findMany({
      where,
      include: {
        vehicles: { where: { deletedAt: null } },
        orders: {
          where: {
            ...(branchId ? { branchId } : {}),
            ...((query.dateFrom || query.dateTo) && {
              scheduledStart: {
                ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
                ...(query.dateTo && { lt: new Date(query.dateTo) }),
              },
            }),
            deletedAt: null,
          },
          select: { id: true, totalPrice: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    const headers = [
      'Client ID',
      'First Name',
      'Last Name',
      'Phone',
      'Email',
      'Vehicles Count',
      'Total Orders',
      'Completed Orders',
      'Total Revenue',
      'Created At',
    ];

    const rows = clients.map((client) => {
      const completedOrders = client.orders.filter(
        (o) => o.status === 'COMPLETED',
      );
      const totalRevenue = completedOrders.reduce(
        (sum, o) => sum + Number(o.totalPrice),
        0,
      );
      return [
        client.id,
        client.firstName,
        client.lastName ?? '',
        client.phone ?? '',
        client.email ?? '',
        client.vehicles.length.toString(),
        client.orders.length.toString(),
        completedOrders.length.toString(),
        totalRevenue.toFixed(2),
        client.createdAt.toISOString(),
      ];
    });

    return toCsv(headers, rows);
  }
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function toCsv(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCsvField).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvField).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}
