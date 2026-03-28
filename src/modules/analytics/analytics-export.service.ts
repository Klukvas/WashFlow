import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

/** Max records per batch to limit memory usage during CSV export. */
const EXPORT_BATCH_SIZE = 2000;
/** Hard cap on total exported records. */
const EXPORT_MAX_RECORDS = 10_000;

@Injectable()
export class AnalyticsExportService {
  private readonly logger = new Logger(AnalyticsExportService.name);

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

    const orders = await this.fetchInBatches('order', where, {
      include: {
        client: true,
        vehicle: true,
        branch: true,
        services: { include: { service: true } },
      },
      orderBy: { scheduledStart: 'desc' },
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = orders.map((order: any) => [
      order.id,
      order.scheduledStart.toISOString(),
      order.status,
      `${order.client.firstName} ${order.client.lastName ?? ''}`.trim(),
      order.client.phone ?? '',
      order.client.email ?? '',
      `${order.vehicle.make} ${order.vehicle.model ?? ''}`.trim(),
      order.vehicle.licensePlate ?? '',
      order.branch.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      order.services.map((s: any) => s.service.name).join('; '),
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

    const clients = await this.fetchInBatches('client', where, {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = clients.map((client: any) => {
      const completedOrders = client.orders.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (o: any) => o.status === 'COMPLETED',
      );
      const totalRevenue = completedOrders.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sum: number, o: any) => sum + Number(o.totalPrice),
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
  /**
   * Fetches records in batches using cursor-based pagination to avoid
   * loading all records into memory at once.
   * Hard-capped at EXPORT_MAX_RECORDS total records.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchInBatches(
    model: 'order' | 'client',
    where: Record<string, unknown>,
    options: Record<string, unknown>,
  ): Promise<any[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = [];
    let cursor: string | undefined;

    while (results.length < EXPORT_MAX_RECORDS) {
      const take = Math.min(
        EXPORT_BATCH_SIZE,
        EXPORT_MAX_RECORDS - results.length,
      );

      // Ensure stable cursor pagination with id tiebreaker
      const orderBy = options.orderBy
        ? [
            ...(Array.isArray(options.orderBy)
              ? options.orderBy
              : [options.orderBy]),
            { id: 'asc' as const },
          ]
        : [{ id: 'asc' as const }];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const batch: any[] = await (this.prisma[model] as any).findMany({
        where,
        ...options,
        orderBy,
        take,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (batch.length === 0) break;

      results.push(...batch);
      cursor = batch[batch.length - 1].id;

      if (batch.length < take) break;
    }

    if (results.length >= EXPORT_MAX_RECORDS) {
      this.logger.warn(
        `Export hit ${EXPORT_MAX_RECORDS} record cap for model "${model}"`,
      );
    }

    return results;
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
