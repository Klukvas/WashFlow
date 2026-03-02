import { useTranslation } from 'react-i18next';
import { OrderStatus } from '@/shared/types/enums';
import { Select } from '@/shared/ui/select';
import { DatePicker } from '@/shared/ui/date-picker';
import { IncludeDeletedToggle } from '@/shared/components/IncludeDeletedToggle';
import { Button } from '@/shared/ui/button';
import type { OrderQueryParams } from '../api/orders.api';
import type { Branch } from '@/shared/types/models';

interface OrderFiltersProps {
  filters: OrderQueryParams;
  branches: Branch[];
  onChange: (filters: Partial<OrderQueryParams>) => void;
  onReset: () => void;
  hideBranchFilter?: boolean;
}

export function OrderFilters({
  filters,
  branches,
  onChange,
  onReset,
  hideBranchFilter,
}: OrderFiltersProps) {
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');

  const statusOptions = Object.values(OrderStatus).map((s) => ({
    value: s,
    label: t(`status.${s}`),
  }));

  const branchOptions = branches.map((b) => ({
    value: b.id,
    label: b.name,
  }));

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-40">
        <Select
          placeholder={t('filters.status')}
          options={[
            { value: '', label: `-- ${t('filters.status')} --` },
            ...statusOptions,
          ]}
          value={filters.status ?? ''}
          onChange={(e) =>
            onChange({
              status: (e.target.value || undefined) as OrderStatus | undefined,
            })
          }
        />
      </div>

      {!hideBranchFilter && (
        <div className="w-40">
          <Select
            placeholder={t('filters.branch')}
            options={[
              { value: '', label: `-- ${t('filters.branch')} --` },
              ...branchOptions,
            ]}
            value={filters.branchId ?? ''}
            onChange={(e) =>
              onChange({ branchId: e.target.value || undefined })
            }
          />
        </div>
      )}

      <div className="w-40">
        <DatePicker
          value={filters.dateFrom ?? ''}
          onChange={(v) => onChange({ dateFrom: v || undefined })}
          placeholder={t('filters.dateFrom')}
          clearable
        />
      </div>

      <div className="w-40">
        <DatePicker
          value={filters.dateTo ?? ''}
          onChange={(v) => onChange({ dateTo: v || undefined })}
          placeholder={t('filters.dateTo')}
          clearable
        />
      </div>

      <IncludeDeletedToggle
        checked={filters.includeDeleted ?? false}
        onChange={(checked) => onChange({ includeDeleted: checked })}
      />

      <Button variant="ghost" size="sm" onClick={onReset}>
        {tc('actions.reset')}
      </Button>
    </div>
  );
}
