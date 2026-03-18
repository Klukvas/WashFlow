import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Merge } from 'lucide-react';
import { useClients, useCreateClient } from '../hooks/useClients';
import { ClientForm, type ClientFormValues } from '../components/ClientForm';
import { MergeClientsDialog } from '../components/MergeClientsDialog';
import { PageHeader } from '@/shared/components/PageHeader';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { SoftDeleteBadge } from '@/shared/components/SoftDeleteBadge';
import { IncludeDeletedToggle } from '@/shared/components/IncludeDeletedToggle';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Dialog, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { formatDate } from '@/shared/utils/format';
import type { Client } from '@/shared/types/models';
import type { ClientQueryParams } from '../api/clients.api';

export function ClientsPage() {
  const { t } = useTranslation('common');
  const { t: tc } = useTranslation('clients');
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);

  const [params, setParams] = useState<ClientQueryParams>({
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    includeDeleted: false,
  });

  const queryParams = useMemo<ClientQueryParams>(
    () => ({
      ...params,
      search: debouncedSearch || undefined,
    }),
    [params, debouncedSearch],
  );

  const { data, isLoading, isError } = useClients(queryParams);
  const { mutate: createMut, isPending: creating } = useCreateClient();

  const toggleSelect = useCallback((clientId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else if (next.size < 2) {
        next.add(clientId);
      }
      return next;
    });
  }, []);

  const staticColumns = useMemo<Column<Client>[]>(
    () => [
      {
        key: 'name',
        header: t('fields.name'),
        render: (client) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {client.firstName} {client.lastName}
            </span>
            <SoftDeleteBadge deletedAt={client.deletedAt} />
          </div>
        ),
      },
      {
        key: 'phone',
        header: t('fields.phone'),
        render: (client) => (
          <span className="text-muted-foreground">{client.phone}</span>
        ),
      },
      {
        key: 'email',
        header: t('fields.email'),
        render: (client) => (
          <span className="text-muted-foreground">{client.email ?? '—'}</span>
        ),
        className: 'hidden md:table-cell',
      },
      {
        key: 'vehicles',
        header: t('fields.vehicles'),
        render: (client) => (
          <span className="text-muted-foreground">
            {client.vehicles?.length ?? 0}
          </span>
        ),
        className: 'hidden lg:table-cell',
      },
      {
        key: 'createdAt',
        header: t('fields.createdAt'),
        render: (client) => (
          <span className="text-muted-foreground">
            {formatDate(client.createdAt)}
          </span>
        ),
        className: 'hidden lg:table-cell',
      },
    ],
    [t],
  );

  const selectColumn: Column<Client> = {
    key: 'select',
    header: '',
    render: (client) => (
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-gray-300"
        checked={selectedIds.has(client.id)}
        disabled={!selectedIds.has(client.id) && selectedIds.size >= 2}
        onChange={() => toggleSelect(client.id)}
        onClick={(e) => e.stopPropagation()}
      />
    ),
    className: 'w-10',
  };

  const columns: Column<Client>[] = [selectColumn, ...staticColumns];

  const handleRowClick = (client: Client) => {
    navigate(`/clients/${client.id}`);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setParams((prev) => ({ ...prev, page: 1 }));
  };

  const handleIncludeDeletedChange = (checked: boolean) => {
    setParams((prev) => ({ ...prev, includeDeleted: checked, page: 1 }));
  };

  const handleCreate = (values: ClientFormValues) => {
    createMut(values, {
      onSuccess: () => setCreateOpen(false),
    });
  };

  // Merge: resolve selected clients from current data
  const selectedClients = useMemo(() => {
    if (selectedIds.size !== 2 || !data?.items) return null;
    const ids = Array.from(selectedIds);
    const first = data.items.find((c) => c.id === ids[0]);
    const second = data.items.find((c) => c.id === ids[1]);
    if (!first || !second) return null;
    return { target: first, source: second };
  }, [selectedIds, data?.items]);

  const handleMergeClose = () => {
    setMergeOpen(false);
    setSelectedIds(new Set());
  };

  return (
    <div>
      <PageHeader
        title={t('pages.clients')}
        actions={
          <div className="flex items-center gap-2">
            {selectedClients && (
              <PermissionGate permission={PERMISSIONS.CLIENTS.UPDATE}>
                <Button variant="outline" onClick={() => setMergeOpen(true)}>
                  <Merge className="h-4 w-4" />
                  {tc('merge.mergeSelected')}
                </Button>
              </PermissionGate>
            )}
            <PermissionGate permission={PERMISSIONS.CLIENTS.CREATE}>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                {t('actions.create')}
              </Button>
            </PermissionGate>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t('actions.search')}
            className="pl-9"
          />
        </div>
        <IncludeDeletedToggle
          checked={params.includeDeleted ?? false}
          onChange={handleIncludeDeletedChange}
        />
      </div>

      {isError ? (
        <div className="flex items-center justify-center p-8">
          <p className="text-sm text-destructive">{t('errors.loadFailed')}</p>
        </div>
      ) : (
        <DataTable<Client>
          columns={columns}
          data={data?.items ?? []}
          loading={isLoading}
          page={params.page ?? 1}
          totalPages={data?.meta.totalPages ?? 1}
          total={data?.meta.total ?? 0}
          limit={params.limit ?? 20}
          onPageChange={(page) => setParams((prev) => ({ ...prev, page }))}
          onLimitChange={(limit) =>
            setParams((prev) => ({ ...prev, limit, page: 1 }))
          }
          onRowClick={handleRowClick}
          emptyMessage={t('status.noResults')}
        />
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)}>
        <DialogHeader>
          <DialogTitle>{t('actions.create')}</DialogTitle>
        </DialogHeader>
        <ClientForm
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
          loading={creating}
        />
      </Dialog>

      {selectedClients && (
        <MergeClientsDialog
          open={mergeOpen}
          onClose={handleMergeClose}
          targetClient={selectedClients.target}
          sourceClient={selectedClients.source}
        />
      )}
    </div>
  );
}
