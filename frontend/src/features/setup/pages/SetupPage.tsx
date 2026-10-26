import { useState } from 'react';
import { useSearchParams, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/shared/components/PageHeader';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/select';
import { Label } from '@/shared/ui/label';
import { Card } from '@/shared/ui/card';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { useBranchScope } from '@/shared/hooks/useBranchScope';
import {
  useAllBranches,
  useCreateBranch,
  useUpdateBranch,
  useBranchBookingSettings,
  useUpdateBranchBookingSettings,
} from '@/features/branches/hooks/useBranches';
import { BranchForm } from '@/features/branches/components/BranchForm';
import { BookingSettingsForm } from '@/features/branches/components/BookingSettingsForm';
import { WorkPostForm } from '@/features/work-posts/components/WorkPostForm';
import {
  useWorkPosts,
  useCreateWorkPost,
} from '@/features/work-posts/hooks/useWorkPosts';
import { ServiceForm } from '@/features/services/components/ServiceForm';
import {
  useServices,
  useCreateService,
} from '@/features/services/hooks/useServices';
import type { Branch } from '@/shared/types/models';
import { FactRow } from '../components/FactRow';
import {
  branchSchema,
  eligibleBranch,
  FIRST_ORDER_PERMISSIONS,
  postFact,
  queryFact,
  serviceFact,
  uuid,
  validTimezone,
  type Fact,
} from '../model';

type Editing = 'branch' | 'hours' | 'post' | 'service' | null;

export function SetupPage() {
  const { t } = useTranslation('dashboard');
  const [params] = useSearchParams();
  const scope = useBranchScope();
  const requested = params.get('branchId');
  // Never mount data hooks for a forged URL outside the signed-in user's branch scope.
  const invalid =
    (requested !== null && !uuid.safeParse(requested).success) ||
    (scope.branchId !== null &&
      requested !== null &&
      requested !== scope.branchId);
  return (
    <div className="mx-auto max-w-4xl space-y-6 text-sm">
      <PageHeader title={t('setup.title')} />
      <p className="max-w-2xl text-muted-foreground">
        {t('setup.description')}
      </p>
      {invalid ? (
        <p role="alert" className="rounded-xl border border-border p-5">
          {t('setup.unavailableBranch')}
        </p>
      ) : (
        <SetupSelection
          requested={scope.branchId ?? requested}
          scoped={scope.isBranchScoped}
        />
      )}
    </div>
  );
}

function SetupSelection({
  requested,
  scoped,
}: {
  requested: string | null;
  scoped: boolean;
}) {
  const { t } = useTranslation('dashboard');
  const { hasPermission } = usePermissions();
  const [, setParams] = useSearchParams();
  const branches = useAllBranches(hasPermission('branches.read'));
  const [creating, setCreating] = useState(false);
  if (!hasPermission('branches.read'))
    return (
      <p role="status">
        {t('setup.readRequired', {
          permission: t('setup.capabilities.branches_read'),
        })}
      </p>
    );
  if (branches.isPending || (branches.isFetching && !branches.data))
    return <p role="status">{t('setup.states.loading')}</p>;
  if (
    branches.isError ||
    !Array.isArray(branches.data) ||
    branches.data.some((b) => !branchSchema.safeParse(b).success)
  ) {
    return (
      <div role="alert">
        <p>{t('setup.states.error')}</p>
        <Button onClick={() => void branches.refetch()}>
          {t('setup.retry')}
        </Button>
      </div>
    );
  }
  const active = branches.data.filter(eligibleBranch);
  const branch = requested
    ? active.find((b) => b.id === requested)
    : active.length === 1
      ? active[0]
      : undefined;
  const choose = (id: string) => {
    setCreating(false);
    setParams(id ? { branchId: id } : {});
  };
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <Label htmlFor="setup-branch">{t('setup.branch')}</Label>
          <Select
            id="setup-branch"
            value={branch?.id ?? ''}
            disabled={scoped}
            options={active.map((b) => ({ value: b.id, label: b.name }))}
            placeholder={t('setup.selectBranch')}
            onChange={(event) => choose(event.target.value)}
          />
        </div>
        {!scoped && hasPermission('branches.create') && (
          <Button variant="outline" onClick={() => setCreating(!creating)}>
            {t('setup.createBranch')}
          </Button>
        )}
      </div>
      {creating && <CreateBranchPanel key="create" onCreated={choose} />}
      {requested && !branch ? (
        <p role="alert">{t('setup.unavailableBranch')}</p>
      ) : branch ? (
        <BranchSetup
          key={branch.id}
          branch={branch}
          refreshing={branches.isFetching}
        />
      ) : active.length > 1 ? (
        <p role="status" className="rounded-xl border border-border p-5">
          {t('setup.selectBranch')}
        </p>
      ) : (
        <>
          <div className="rounded-xl bg-primary/5 p-5">
            <h2 className="text-base font-semibold">{t('setup.progress')}</h2>
            <p className="mt-1">0/4 · {t('setup.noGuarantee')}</p>
          </div>
          <Card>
            <ul>
              <FactRow
                name={t('setup.rows.branch')}
                description={t('setup.branchDescription')}
                fact={{ state: 'incomplete' }}
              />
              {(['hours', 'post', 'service'] as const).map((row) => (
                <FactRow
                  key={row}
                  name={t(`setup.rows.${row}`)}
                  description={t('setup.selectFirst')}
                  fact={{ state: 'unavailable' }}
                />
              ))}
            </ul>
          </Card>
          {!hasPermission('branches.create') && (
            <p>
              {t('setup.writeRequired', {
                permission: t('setup.capabilities.branches_create'),
              })}
            </p>
          )}
          <Card className="space-y-3 p-5">
            <h2 className="text-base font-semibold">{t('setup.firstOrder')}</h2>
            <p>{t('setup.finishFirst')}</p>
            <p className="text-muted-foreground">{t('setup.optional')}</p>
          </Card>
        </>
      )}
    </>
  );
}

function CreateBranchPanel({ onCreated }: { onCreated: (id: string) => void }) {
  const creation = useCreateBranch();
  const { t } = useTranslation('dashboard');
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-base font-semibold">
        {t('setup.createBranch')}
      </h2>
      <fieldset disabled={creation.isPending}>
        <BranchForm
          isPending={creation.isPending}
          onSubmit={(data) =>
            creation.mutate(data, {
              onSuccess: (branch) => onCreated(branch.id),
            })
          }
        />
      </fieldset>
    </Card>
  );
}

function BranchSetup({
  branch,
  refreshing,
}: {
  branch: Branch;
  refreshing: boolean;
}) {
  const { t } = useTranslation('dashboard');
  const { hasPermission, hasAllPermissions } = usePermissions();
  const settings = useBranchBookingSettings(
    branch.id,
    hasPermission('branches.read'),
  );
  const posts = useWorkPosts(
    { branchId: branch.id },
    hasPermission('work-posts.read'),
  );
  // Services are tenant-wide; no invented branchId or pagination for these full-array APIs.
  const services = useServices({}, hasPermission('services.read'));
  const updateBranch = useUpdateBranch();
  const updateSettings = useUpdateBranchBookingSettings();
  const createPost = useCreateWorkPost();
  const createService = useCreateService();
  const [editing, setEditing] = useState<Editing>(null);
  const branchFact: Fact = {
    state: refreshing
      ? 'loading'
      : validTimezone(branch.timezone)
        ? 'complete'
        : 'incomplete',
  };
  const hoursFact = queryFact(settings, {
    state: settings.data ? 'complete' : 'incomplete',
  });
  const postsFact = hasPermission('work-posts.read')
    ? queryFact(posts, postFact(posts.data?.items, branch))
    : ({ state: 'unavailable' } as Fact);
  const servicesFact = hasPermission('services.read')
    ? queryFact(services, serviceFact(services.data?.items, branch))
    : ({ state: 'unavailable' } as Fact);
  const facts = [branchFact, hoursFact, postsFact, servicesFact];
  const count = facts.filter((fact) => fact.state === 'complete').length;
  const complete = count === 4;
  const action = (target: Editing, read: string, write: string) => {
    if (!hasPermission(read))
      return (
        <p className="max-w-60 text-muted-foreground">
          {t('setup.readRequired', {
            permission: t(`setup.capabilities.${read.replace(/[.-]/g, '_')}`),
          })}
        </p>
      );
    if (!hasPermission(write))
      return (
        <p className="max-w-60 text-muted-foreground">
          {t('setup.writeRequired', {
            permission: t(`setup.capabilities.${write.replace(/[.-]/g, '_')}`),
          })}
        </p>
      );
    return (
      <Button
        variant="outline"
        onClick={() => setEditing(editing === target ? null : target)}
      >
        {t(`setup.actions.${target}`)}
      </Button>
    );
  };
  const pending =
    updateBranch.isPending || updateSettings.isPending || createPost.isPending;
  const missing = FIRST_ORDER_PERMISSIONS.filter(
    (permission) => !hasPermission(permission),
  );
  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-xl bg-primary/5 p-5">
        <div>
          <h2 className="text-base font-semibold">
            {t(complete ? 'setup.complete' : 'setup.progress')}
          </h2>
          <p className="mt-1 text-muted-foreground">{t('setup.noGuarantee')}</p>
        </div>
        <span
          className="shrink-0 font-mono text-xl"
          aria-label={t('setup.count', { count })}
        >
          {count}/4
        </span>
      </div>
      <Card>
        <ul>
          <FactRow
            name={t('setup.rows.branch')}
            description={`${branch.name} · ${branch.timezone}`}
            fact={branchFact}
            action={action('branch', 'branches.read', 'branches.update')}
          />
          <FactRow
            name={t('setup.rows.hours')}
            description={t('setup.hoursDescription')}
            fact={hoursFact}
            action={action('hours', 'branches.read', 'branches.update')}
          />
          <FactRow
            name={t('setup.rows.post')}
            description={t('setup.postDescription')}
            fact={postsFact}
            action={action('post', 'work-posts.read', 'work-posts.create')}
          />
          <FactRow
            name={t('setup.rows.service')}
            description={t('setup.serviceDescription')}
            fact={servicesFact}
            action={action('service', 'services.read', 'services.create')}
          />
        </ul>
      </Card>
      {editing && editing !== 'service' && (
        <Card className="p-5" key={`${branch.id}-${editing}`}>
          <fieldset disabled={pending} className="min-w-0">
            {editing === 'branch' &&
              hasAllPermissions(['branches.read', 'branches.update']) && (
                <BranchForm
                  branch={branch}
                  isPending={updateBranch.isPending}
                  onCancel={() => setEditing(null)}
                  onSubmit={(data) =>
                    updateBranch.mutate(
                      { id: branch.id, ...data },
                      { onSuccess: () => setEditing(null) },
                    )
                  }
                />
              )}
            {editing === 'hours' &&
              hasAllPermissions(['branches.read', 'branches.update']) &&
              settings.data !== undefined &&
              !settings.isError && (
                <BookingSettingsForm
                  settings={settings.data ?? null}
                  isPending={updateSettings.isPending}
                  onCancel={() => setEditing(null)}
                  onSubmit={(data) =>
                    updateSettings.mutate(
                      { branchId: branch.id, ...data },
                      { onSuccess: () => setEditing(null) },
                    )
                  }
                />
              )}
            {editing === 'post' &&
              hasAllPermissions(['work-posts.read', 'work-posts.create']) && (
                <WorkPostForm
                  branchId={branch.id}
                  isPending={createPost.isPending}
                  onCancel={() => setEditing(null)}
                  onSubmit={(data) =>
                    createPost.mutate(data, {
                      onSuccess: () => setEditing(null),
                    })
                  }
                />
              )}
          </fieldset>
        </Card>
      )}
      {hasAllPermissions(['services.read', 'services.create']) && (
        <ServiceForm
          open={editing === 'service'}
          onClose={() => setEditing(null)}
          loading={createService.isPending}
          onSubmit={(data) =>
            createService.mutate(data, { onSuccess: () => setEditing(null) })
          }
        />
      )}
      <Card className="space-y-3 p-5">
        <h2 className="text-base font-semibold">{t('setup.firstOrder')}</h2>
        <p className="text-muted-foreground">
          {t('setup.firstOrderDescription')}
        </p>
        {complete && missing.length === 0 ? (
          <Link
            className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            to={`/orders/create?branchId=${branch.id}`}
          >
            {t('setup.quickOrder')}
          </Link>
        ) : (
          <p role="status">
            {missing.length
              ? t('setup.orderPermissions', {
                  permissions: missing
                    .map((permission) =>
                      t(
                        `setup.capabilities.${permission.replace(/[.-]/g, '_')}`,
                      ),
                    )
                    .join(', '),
                })
              : t('setup.finishFirst')}
          </p>
        )}
        <p className="text-muted-foreground">{t('setup.optional')}</p>
      </Card>
    </>
  );
}
