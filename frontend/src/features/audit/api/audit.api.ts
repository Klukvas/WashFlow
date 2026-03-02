import { apiClient, toPaginated } from '@/shared/api/client';
import type { PaginatedApiResponse, PaginatedResponse, PaginationParams } from '@/shared/types/api';
import type { AuditLog } from '@/shared/types/models';
import type { AuditAction } from '@/shared/types/enums';

export interface AuditQueryParams extends PaginationParams {
  entityType?: string;
  entityId?: string;
  action?: AuditAction;
  performedById?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function fetchAuditLogs(params: AuditQueryParams): Promise<PaginatedResponse<AuditLog>> {
  const { data } = await apiClient.get<PaginatedApiResponse<AuditLog>>('/audit-logs', { params });
  return toPaginated(data);
}
