import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { REFERENCE_TOPICS, FLOW_TOPICS } from '../constants/topics';
import type { TopicMeta } from '../constants/topics';
import { cn } from '@/shared/utils/cn';

function TopicLinks({ items }: { items: readonly TopicMeta[] }) {
  const { t } = useTranslation('how-to');

  return (
    <>
      {items.map((topic) => (
        <NavLink
          key={topic.slug}
          to={`/how-to/${topic.slug}`}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )
          }
        >
          <topic.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {t(`topics.${topic.slug}.title`)}
          </span>
        </NavLink>
      ))}
    </>
  );
}

export function TopicSidebar({ showLabels = false }: { showLabels?: boolean }) {
  const { t } = useTranslation('how-to');

  return (
    <nav className="flex flex-col gap-1">
      {showLabels && (
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('meta.topics')}
        </p>
      )}
      <TopicLinks items={REFERENCE_TOPICS} />

      <div className="my-2 border-t border-border" />

      {showLabels && (
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('meta.flows')}
        </p>
      )}
      <TopicLinks items={FLOW_TOPICS} />
    </nav>
  );
}
