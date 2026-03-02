import { useQuery } from '@tanstack/react-query';
import { fetchAuditLogs, type AuditQueryParams } from '../api/audit.api';

export function useAuditLogs(params: AuditQueryParams) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => fetchAuditLogs(params),
  });
}
