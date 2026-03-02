import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { Button } from '@/shared/ui/button';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const toggle = () => {
    const next = i18n.language === 'en' ? 'uk' : 'en';
    i18n.changeLanguage(next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={i18n.t('common:language.switch')}
    >
      <Languages className="h-5 w-5" />
    </Button>
  );
}
