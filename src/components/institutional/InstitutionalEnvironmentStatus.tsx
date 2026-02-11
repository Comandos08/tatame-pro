
import { useI18n } from '@/contexts/I18nContext';

export function InstitutionalEnvironmentStatus() {
  const { t } = useI18n();

  return (
    <div className="mb-4 rounded-lg border border-border/50 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
      <span>{t('institutional.environment.active')}</span>
    </div>
  );
}
