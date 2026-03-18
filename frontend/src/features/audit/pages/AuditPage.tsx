import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AuditAction } from '@/shared/types/enums';
import { useAuditLogs } from '../hooks/useAuditLogs';
import { PageHeader } from '@/shared/components/PageHeader';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { Badge } from '@/shared/ui/badge';
import { Select } from '@/shared/ui/select';
import { Input } from '@/shared/ui/input';
import { DatePicker } from '@/shared/ui/date-picker';
import { Button } from '@/shared/ui/button';
import { formatDateTime } from '@/shared/utils/format';
import type { AuditLog } from '@/shared/types/models';
import type { AuditQueryParams } from '../api/audit.api';

const ACTION_COLORS: Record<
  AuditAction,
  'default' | 'success' | 'warning' | 'destructive'
> = {
  [AuditAction.CREATE]: 'success',
  [AuditAction.UPDATE]: 'warning',
  [AuditAction.DELETE]: 'destructive',
  [AuditAction.STATUS_CHANGE]: 'default',
};

export function AuditPage() {
  const { t } = useTranslation('audit');
  const { t: tn } = useTranslation('nav');
  const { t: tc } = useTranslation('common');
  const [filters, setFilters] = useState<AuditQueryParams>({
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const { data, isLoading, isError } = useAuditLogs(filters);

  const columns: Column<AuditLog>[] = useMemo(
    () => [
      {
        key: 'createdAt',
        header: t('date'),
        render: (log) => formatDateTime(log.createdAt),
      },
      {
        key: 'action',
        header: t('action'),
        render: (log) => (
          <Badge variant={ACTION_COLORS[log.action]}>{log.action}</Badge>
        ),
      },
      {
        key: 'entityType',
        header: t('entity'),
        render: (log) => <span className="font-medium">{log.entityType}</span>,
      },
      {
        key: 'entityId',
        header: t('entityId'),
        render: (log) => (
          <span className="font-mono text-xs">
            {log.entityId.slice(0, 8)}&hellip;
          </span>
        ),
        className: 'hidden md:table-cell',
      },
      {
        key: 'performer',
        header: t('performedBy'),
        render: (log) =>
          log.performedBy
            ? `${log.performedBy.firstName} ${log.performedBy.lastName}`
            : '—',
        className: 'hidden lg:table-cell',
      },
    ],
    [t],
  );

  const actionOptions = Object.values(AuditAction).map((a) => ({
    value: a,
    label: a,
  }));

  return (
    <div>
      <PageHeader title={tn('audit')} />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          options={[{ value: '', label: t('filterAction') }, ...actionOptions]}
          value={filters.action ?? ''}
          onChange={(e) =>
            setFilters((p) => ({
              ...p,
              action: (e.target.value || undefined) as AuditAction | undefined,
              page: 1,
            }))
          }
          className="w-full sm:w-40"
        />
        <Input
          type="text"
          placeholder={t('filterEntityType')}
          value={filters.entityType ?? ''}
          onChange={(e) =>
            setFilters((p) => ({
              ...p,
              entityType: e.target.value || undefined,
              page: 1,
            }))
          }
          className="w-full sm:w-40"
        />
        <DatePicker
          value={filters.dateFrom ?? ''}
          onChange={(v) =>
            setFilters((p) => ({
              ...p,
              dateFrom: v || undefined,
              page: 1,
            }))
          }
          placeholder={t('dateFrom')}
          clearable
          className="w-full sm:w-40"
        />
        <DatePicker
          value={filters.dateTo ?? ''}
          onChange={(v) =>
            setFilters((p) => ({
              ...p,
              dateTo: v || undefined,
              page: 1,
            }))
          }
          placeholder={t('dateTo')}
          clearable
          className="w-full sm:w-40"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setFilters({
              page: 1,
              limit: 20,
              sortBy: 'createdAt',
              sortOrder: 'desc',
            })
          }
        >
          {tc('actions.reset')}
        </Button>
      </div>

      {isError ? (
        <div className="flex items-center justify-center p-8">
          <p className="text-sm text-destructive">{tc('errors.loadFailed')}</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          loading={isLoading}
          page={filters.page ?? 1}
          totalPages={data?.meta.totalPages ?? 1}
          total={data?.meta.total ?? 0}
          limit={filters.limit ?? 20}
          onPageChange={(page) => setFilters((p) => ({ ...p, page }))}
        />
      )}
    </div>
  );
}
