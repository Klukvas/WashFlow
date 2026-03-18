import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useCreateClient } from '@/features/clients/hooks/useClients';
import {
  ClientForm,
  type ClientFormValues,
} from '@/features/clients/components/ClientForm';
import { apiClient } from '@/shared/api/client';
import type { PaginatedApiResponse } from '@/shared/types/api';
import type { Branch, Client } from '@/shared/types/models';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';

interface StepBranchClientProps {
  branchId: string;
  clientId: string;
  branches: Branch[];
  onBranchChange: (branchId: string) => void;
  onClientChange: (clientId: string, displayName: string) => void;
  onNext: () => void;
  branchError?: string;
  hideBranchSelector?: boolean;
}

export function StepBranchClient({
  branchId,
  clientId,
  branches,
  onBranchChange,
  onClientChange,
  onNext,
  branchError,
  hideBranchSelector,
}: StepBranchClientProps) {
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');
  const queryClient = useQueryClient();
  const [clientSearch, setClientSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const { mutate: createClientMut, isPending: isCreatingClient } =
    useCreateClient();

  const { data: clients } = useQuery({
    queryKey: ['clients', clientSearch],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedApiResponse<Client>>(
        '/clients',
        { params: { search: clientSearch, limit: 10 } },
      );
      return data.data;
    },
    enabled: clientSearch.length >= 2,
  });

  const handleQuickCreateClient = (values: ClientFormValues) => {
    createClientMut(values, {
      onSuccess: (newClient) => {
        const name =
          `${newClient.firstName} ${newClient.lastName ?? ''}`.trim();
        onClientChange(newClient.id, name);
        setClientSearch(name);
        setDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ['clients'] });
      },
    });
  };

  return (
    <div className="space-y-4">
      {!hideBranchSelector && (
        <div>
          <Label>{t('fields.branch')}</Label>
          <Select
            options={branches.map((b) => ({
              value: b.id,
              label: b.name,
            }))}
            placeholder={t('filters.branch')}
            value={branchId}
            onChange={(e) => onBranchChange(e.target.value)}
            error={branchError}
          />
        </div>
      )}
      <div>
        <Label>{t('creation.searchClient')}</Label>
        <Input
          value={clientSearch}
          onChange={(e) => {
            setClientSearch(e.target.value);
            if (clientId) {
              onClientChange('', '');
            }
          }}
          placeholder={t('creation.searchClient')}
        />
      </div>
      {!clientId && clients && clients.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-md border border-border">
          {clients.map((c) => (
            <button
              key={c.id}
              className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-accent"
              onClick={() => {
                const name = [c.firstName, c.lastName]
                  .filter(Boolean)
                  .join(' ');
                onClientChange(c.id, name);
                setClientSearch(name);
              }}
            >
              <span className="font-medium">
                {[c.firstName, c.lastName].filter(Boolean).join(' ')}
              </span>
              <span className="text-sm text-muted-foreground">{c.phone}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="mr-1 h-4 w-4" />
          {tc('actions.create')} {t('fields.client')}
        </Button>
      </div>
      <Button onClick={onNext} disabled={!branchId || !clientId}>
        {tc('actions.next')}
      </Button>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogHeader>
          <DialogTitle>
            {tc('actions.create')} {t('fields.client')}
          </DialogTitle>
        </DialogHeader>
        <ClientForm
          onSubmit={handleQuickCreateClient}
          onCancel={() => setDialogOpen(false)}
          loading={isCreatingClient}
        />
      </Dialog>
    </div>
  );
}
