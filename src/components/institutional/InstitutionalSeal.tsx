
import { ShieldCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/contexts/I18nContext';

export function InstitutionalSeal() {
  const { t } = useI18n();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-default">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('institutional.seal')}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-center">
        <p>{t('institutional.sealTooltip')}</p>
      </TooltipContent>
    </Tooltip>
  );
}
