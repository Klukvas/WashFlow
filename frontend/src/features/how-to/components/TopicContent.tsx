import { useEffect } from 'react';
import { useParams, Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Lightbulb, MapPin } from 'lucide-react';
import { TOPIC_SLUGS, TOPICS } from '../constants/topics';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Badge } from '@/shared/ui/badge';

interface TopicSection {
  heading: string;
  body: string;
  tip?: string;
}

interface FlowStep {
  title: string;
  where?: string;
  body: string;
  tip?: string;
}

function SectionCard({ section }: { section: TopicSection }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{section.heading}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed text-foreground/90">
          {section.body}
        </p>
        {section.tip && <TipBlock text={section.tip} />}
      </CardContent>
    </Card>
  );
}

function StepCard({ step, index }: { step: FlowStep; index: number }) {
  return (
    <div className="relative flex gap-4">
      {/* Vertical connector line */}
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {index + 1}
        </div>
        <div className="w-px flex-1 bg-border" />
      </div>

      {/* Step content */}
      <Card className="mb-4 flex-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{step.title}</CardTitle>
          {step.where && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>{step.where}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed text-foreground/90">
            {step.body}
          </p>
          {step.tip && <TipBlock text={step.tip} />}
        </CardContent>
      </Card>
    </div>
  );
}

function TipBlock({ text }: { text: string }) {
  return (
    <div className="flex gap-2 rounded-md border border-primary/20 bg-primary/5 p-3">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p className="text-sm text-primary/90">{text}</p>
    </div>
  );
}

export function TopicContent() {
  const { topicSlug } = useParams<{ topicSlug: string }>();
  const { t } = useTranslation('how-to');

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [topicSlug]);

  if (!topicSlug || !TOPIC_SLUGS.has(topicSlug)) {
    return <Navigate to="/404" replace />;
  }

  const topicMeta = TOPICS.find((tp) => tp.slug === topicSlug);
  const isFlow = topicMeta?.type === 'flow';
  const title = t(`topics.${topicSlug}.title`);
  const description = t(`topics.${topicSlug}.description`);

  const Icon = topicMeta?.icon;

  // Flows use "steps", regular topics use "sections"
  const contentKey = isFlow ? 'steps' : 'sections';
  const items = t(`topics.${topicSlug}.${contentKey}`, {
    returnObjects: true,
  }) as (TopicSection | FlowStep)[];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          {Icon && <Icon className="h-7 w-7 text-primary" />}
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          {isFlow && <Badge variant="outline">Flow</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {isFlow ? (
        <div>
          {Array.isArray(items) &&
            (items as FlowStep[]).map((step, idx) => (
              <StepCard key={step.title || idx} step={step} index={idx} />
            ))}
        </div>
      ) : (
        <div className="space-y-4">
          {Array.isArray(items) &&
            (items as TopicSection[]).map((section, idx) => (
              <SectionCard key={section.heading || idx} section={section} />
            ))}
        </div>
      )}
    </div>
  );
}
