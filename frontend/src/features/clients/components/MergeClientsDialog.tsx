import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ArrowLeftRight } from 'lucide-react';
import { useClients, useMergeClients } from '../hooks/useClients';
import { useDebounce } from '@/shared/hooks/useDebounce';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import type { Client, Vehicle } from '@/shared/types/models';

interface MergeClientsDialogProps {
  open: boolean;
  onClose: () => void;
  targetClient: Client;
  sourceClient?: Client;
}

type MergeableField = 'firstName' | 'lastName' | 'phone' | 'email' | 'notes';

const MERGEABLE_FIELDS: MergeableField[] = [
  'firstName',
  'lastName',
  'phone',
  'email',
  'notes',
];

const FIELD_LABEL_KEYS: Record<MergeableField, string> = {
  firstName: 'fields.firstName',
  lastName: 'fields.lastName',
  phone: 'fields.phone',
  email: 'fields.email',
  notes: 'fields.notes',
};

export function MergeClientsDialog({
  open,
  onClose,
  targetClient,
  sourceClient: initialSource,
}: MergeClientsDialogProps) {
  const { t } = useTranslation('clients');
  const { t: tc } = useTranslation('common');

  // Step 1 state (search for source)
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [selectedSource, setSelectedSource] = useState<Client | null>(
    initialSource ?? null,
  );

  // Step tracking
  const startStep = initialSource ? 2 : 1;
  const [step, setStep] = useState(startStep);

  // Swap state: tracks whether source and target have been swapped
  const [isSwapped, setIsSwapped] = useState(false);

  // Step 2 state (field picker)
  const [fieldSelections, setFieldSelections] = useState<
    Record<MergeableField, 'target' | 'source'>
  >({
    firstName: 'target',
    lastName: 'target',
    phone: 'target',
    email: 'target',
    notes: 'target',
  });

  // Search clients for step 1
  const { data: searchResults, isLoading: searching } = useClients({
    search: debouncedSearch || undefined,
    page: 1,
    limit: 10,
  });

  const { mutate: mergeMut, isPending: merging } = useMergeClients();

  // Pre-filter search results once to avoid double filtering in render
  const filteredResults = useMemo(
    () => searchResults?.items.filter((c) => c.id !== targetClient.id) ?? [],
    [searchResults?.items, targetClient.id],
  );

  // Resolve actual source and target based on swap state
  const source = isSwapped ? targetClient : selectedSource;
  const displayTarget = isSwapped ? selectedSource : targetClient;

  // Build field overrides from selections
  const fieldOverrides = useMemo(() => {
    if (!source || !displayTarget) return null;
    const overrides: Record<string, string | undefined> = {};
    for (const field of MERGEABLE_FIELDS) {
      const value =
        fieldSelections[field] === 'target'
          ? displayTarget[field]
          : source[field];
      overrides[field] = value ?? undefined;
    }
    return overrides as {
      firstName: string;
      lastName?: string;
      phone?: string;
      email?: string;
      notes?: string;
    };
  }, [fieldSelections, displayTarget, source]);

  // Vehicle dedup analysis
  const vehicleAnalysis = useMemo(() => {
    if (!source || !displayTarget)
      return { all: [], duplicates: new Set<string>() };
    const targetVehicles = displayTarget.vehicles ?? [];
    const sourceVehicles = source.vehicles ?? [];

    const targetPlates = new Set(
      targetVehicles.filter((v) => v.licensePlate).map((v) => v.licensePlate!),
    );

    const duplicates = new Set<string>();
    for (const sv of sourceVehicles) {
      if (sv.licensePlate && targetPlates.has(sv.licensePlate)) {
        duplicates.add(sv.id);
      }
    }

    return {
      all: [...targetVehicles, ...sourceVehicles],
      duplicates,
      targetVehicles,
      sourceVehicles,
    };
  }, [displayTarget, source]);

  const handleFieldSelect = (
    field: MergeableField,
    side: 'target' | 'source',
  ) => {
    setFieldSelections((prev) => ({ ...prev, [field]: side }));
  };

  const handleSwap = () => {
    if (!source) return;
    setIsSwapped((prev) => !prev);
    // Flip all field selections so the UI continues showing the same values
    setFieldSelections((prev) => {
      const flipped = {} as Record<MergeableField, 'target' | 'source'>;
      for (const field of MERGEABLE_FIELDS) {
        flipped[field] = prev[field] === 'target' ? 'source' : 'target';
      }
      return flipped;
    });
  };

  const handleConfirm = () => {
    if (!source || !displayTarget || !fieldOverrides) return;
    mergeMut(
      {
        sourceClientId: source.id,
        targetClientId: displayTarget.id,
        fieldOverrides,
      },
      {
        onSuccess: () => {
          handleClose();
        },
      },
    );
  };

  const handleClose = () => {
    setSearch('');
    setSelectedSource(initialSource ?? null);
    setStep(startStep);
    setIsSwapped(false);
    setFieldSelections({
      firstName: 'target',
      lastName: 'target',
      phone: 'target',
      email: 'target',
      notes: 'target',
    });
    onClose();
  };

  const clientName = (c: Client) => `${c.firstName} ${c.lastName ?? ''}`.trim();

  return (
    <Dialog open={open} onClose={handleClose} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{t('merge.title')}</DialogTitle>
        <p className="text-xs text-muted-foreground">
          {t('merge.step', { current: step, total: initialSource ? 2 : 3 })}
        </p>
      </DialogHeader>

      {/* Step 1: Search for source client */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('merge.selectSource')}
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('merge.searchSource')}
              className="pl-9"
            />
          </div>
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {searching && (
              <p
                role="status"
                aria-live="polite"
                className="py-4 text-center text-sm text-muted-foreground"
              >
                {tc('status.loading')}
              </p>
            )}
            {filteredResults.map((client) => (
              <button
                key={client.id}
                type="button"
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  setSelectedSource(client);
                  setStep(2);
                }}
              >
                <div>
                  <span className="font-medium">{clientName(client)}</span>
                  {client.phone && (
                    <span className="ml-2 text-muted-foreground">
                      {client.phone}
                    </span>
                  )}
                </div>
                {client.email && (
                  <span className="text-xs text-muted-foreground">
                    {client.email}
                  </span>
                )}
              </button>
            ))}
            {searchResults && filteredResults.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {tc('status.noResults')}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              {tc('actions.cancel')}
            </Button>
          </DialogFooter>
        </div>
      )}

      {/* Step 2: Compare & Pick Fields */}
      {step === 2 && source && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('merge.fieldPicker')}
          </p>

          {/* Header */}
          <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2">
            <div className="text-center text-xs font-medium text-muted-foreground">
              {t('merge.target')}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSwap}
              title={t('merge.swap')}
            >
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
            <div className="text-center text-xs font-medium text-muted-foreground">
              {t('merge.source')}
            </div>
          </div>

          {/* Client names */}
          <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2">
            <div className="text-center text-sm font-semibold">
              {displayTarget && clientName(displayTarget)}
            </div>
            <div />
            <div className="text-center text-sm font-semibold">
              {clientName(source)}
            </div>
          </div>

          {/* Field picker rows */}
          <div className="space-y-2">
            {MERGEABLE_FIELDS.map((field) => {
              const targetVal = displayTarget
                ? (displayTarget[field] ?? '—')
                : '—';
              const sourceVal = source[field] ?? '—';
              return (
                <div
                  key={field}
                  className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 rounded-md border p-2"
                >
                  <button
                    type="button"
                    className={`rounded px-2 py-1 text-left text-sm ${
                      fieldSelections[field] === 'target'
                        ? 'bg-primary/10 ring-1 ring-primary'
                        : 'hover:bg-accent'
                    }`}
                    onClick={() => handleFieldSelect(field, 'target')}
                  >
                    <span className="block text-xs text-muted-foreground">
                      {tc(FIELD_LABEL_KEYS[field])}
                    </span>
                    <span className="font-medium">{targetVal}</span>
                  </button>
                  <div className="text-xs text-muted-foreground">vs</div>
                  <button
                    type="button"
                    className={`rounded px-2 py-1 text-left text-sm ${
                      fieldSelections[field] === 'source'
                        ? 'bg-primary/10 ring-1 ring-primary'
                        : 'hover:bg-accent'
                    }`}
                    onClick={() => handleFieldSelect(field, 'source')}
                  >
                    <span className="block text-xs text-muted-foreground">
                      {tc(FIELD_LABEL_KEYS[field])}
                    </span>
                    <span className="font-medium">{sourceVal}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Vehicles section */}
          {vehicleAnalysis.all.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t('merge.vehicles')}</h4>
              <div className="space-y-1">
                {vehicleAnalysis.targetVehicles?.map((v: Vehicle) => (
                  <VehicleRow key={v.id} vehicle={v} side="target" />
                ))}
                {vehicleAnalysis.sourceVehicles?.map((v: Vehicle) => (
                  <VehicleRow
                    key={v.id}
                    vehicle={v}
                    side="source"
                    isDuplicate={vehicleAnalysis.duplicates.has(v.id)}
                    duplicateLabel={t('merge.duplicateVehicle')}
                  />
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            {!initialSource && (
              <Button variant="outline" onClick={() => setStep(1)}>
                {tc('actions.back')}
              </Button>
            )}
            <Button variant="outline" onClick={handleClose}>
              {tc('actions.cancel')}
            </Button>
            <Button onClick={() => setStep(3)}>{tc('actions.next')}</Button>
          </DialogFooter>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && source && displayTarget && fieldOverrides && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('merge.confirmMessage', {
              source: clientName(source),
              target: clientName(displayTarget),
            })}
          </p>

          {/* Summary of picked values */}
          <div className="space-y-2 rounded-md border p-3">
            {MERGEABLE_FIELDS.map((field) => (
              <div key={field} className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {tc(FIELD_LABEL_KEYS[field])}
                </span>
                <span className="font-medium">
                  {fieldOverrides[field] ?? '—'}
                </span>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStep(2)}>
              {tc('actions.back')}
            </Button>
            <Button variant="outline" onClick={handleClose} disabled={merging}>
              {tc('actions.cancel')}
            </Button>
            <Button onClick={handleConfirm} loading={merging}>
              {t('merge.mergeButton')}
            </Button>
          </DialogFooter>
        </div>
      )}
    </Dialog>
  );
}

function VehicleRow({
  vehicle,
  side,
  isDuplicate,
  duplicateLabel,
}: {
  vehicle: Vehicle;
  side: 'target' | 'source';
  isDuplicate?: boolean;
  duplicateLabel?: string;
}) {
  const label = vehicle.licensePlate
    ? vehicle.licensePlate
    : [vehicle.make, vehicle.model].filter(Boolean).join(' ');

  return (
    <div className="flex items-center justify-between rounded bg-muted/50 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${side === 'target' ? 'bg-primary' : 'bg-warning'}`}
        />
        <span>{label}</span>
        {isDuplicate && (
          <span className="text-xs text-warning">{duplicateLabel}</span>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {[vehicle.make, vehicle.model, vehicle.year && `(${vehicle.year})`]
          .filter(Boolean)
          .join(' ')}
      </span>
    </div>
  );
}
