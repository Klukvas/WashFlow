import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/badge';

interface SoftDeleteBadgeProps {
  deletedAt: string | null;
}

export function SoftDeleteBadge({ deletedAt }: SoftDeleteBadgeProps) {
  const { t } = useTranslation('common');

  if (!deletedAt) return null;

  return <Badge variant="destructive">{t('softDelete.deletedBadge')}</Badge>;
}
