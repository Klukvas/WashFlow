import { useTranslation } from 'react-i18next';

interface IncludeDeletedToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function IncludeDeletedToggle({ checked, onChange }: IncludeDeletedToggleProps) {
  const { t } = useTranslation('common');

  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
      />
      <span className="text-muted-foreground">{t('softDelete.showDeleted')}</span>
    </label>
  );
}
