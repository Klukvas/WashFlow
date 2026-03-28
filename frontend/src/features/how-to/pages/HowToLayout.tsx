import { Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/shared/components/Seo';
import { PageHeader } from '@/shared/components/PageHeader';
import { TopicSidebar } from '../components/TopicSidebar';

export function HowToLayout() {
  const { t } = useTranslation('how-to');

  return (
    <div>
      <Seo
        title={t('meta.title')}
        description={t('meta.description')}
        path="/how-to"
      />
      <PageHeader title={t('meta.title')} description={t('meta.description')} />

      {/* Mobile: horizontal scrollable topic list */}
      <div className="mb-4 overflow-x-auto lg:hidden">
        <div className="min-w-max">
          <TopicSidebar />
        </div>
      </div>

      <div className="flex gap-6">
        {/* Desktop: sticky left TOC with section labels */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="h-[calc(100vh-5rem)] overflow-y-auto py-6">
            <TopicSidebar showLabels />
          </div>
        </aside>

        {/* Content area */}
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
