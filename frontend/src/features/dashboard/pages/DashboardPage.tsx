import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/shared/components/PageHeader';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { SetupEntry } from '@/features/setup/components/SetupEntry';
import { DashboardAnalytics } from '../components/DashboardAnalytics';

export function DashboardPage() {
  const { t } = useTranslation('nav');
  const { hasPermission } = usePermissions();
  return (
    <div className="space-y-6">
      <PageHeader title={t('dashboard')} />
      <SetupEntry />
      {hasPermission('analytics.view') && <DashboardAnalytics />}
    </div>
  );
}
