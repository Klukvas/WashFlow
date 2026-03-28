import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/shared/components/Seo';
import { TopicContent } from '../components/TopicContent';

export function HowToTopicPage() {
  const { topicSlug = '' } = useParams<{ topicSlug: string }>();
  const { t } = useTranslation('how-to');

  const title = t(`topics.${topicSlug}.title`, '');
  const description = t(`topics.${topicSlug}.description`, '');

  return (
    <>
      {title && (
        <Seo
          title={title}
          description={description}
          path={`/how-to/${topicSlug}`}
        />
      )}
      <TopicContent />
    </>
  );
}
