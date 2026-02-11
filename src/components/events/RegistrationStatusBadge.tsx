
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { EventRegistrationStatus, EVENT_REGISTRATION_STATUS_CONFIG } from '@/types/event';
import { useI18n } from '@/contexts/I18nContext';

interface RegistrationStatusBadgeProps {
  status: EventRegistrationStatus;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

const colorVariants: Record<'warning' | 'success' | 'muted', string> = {
  warning: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  success: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  muted: 'bg-muted text-muted-foreground border-muted',
};

const sizeVariants = {
  sm: 'text-xs px-2 py-0.5',
  default: 'text-sm px-2.5 py-0.5',
  lg: 'text-base px-3 py-1',
};

// P2.3.1 — Help keys for tooltip (status → helpKey)
const HELP_KEY_MAP: Record<EventRegistrationStatus, string> = {
  PENDING: 'events.registration.pending.help',
  CONFIRMED: 'events.registration.confirmed.help',
  CANCELED: 'events.registration.canceled.help',
};

/**
 * RegistrationStatusBadge
 * 
 * Componente UX puro que traduz status técnico de inscrição → badge visual.
 * 
 * REGRAS P2.3 + P2.3.1:
 * - Usa SOMENTE i18n (sem fallback hardcoded)
 * - Status desconhecido → Badge neutro com t('common.unknown')
 * - Tooltip explicativo em hover/focus (P2.3.1)
 * - Nenhum side effect
 */
export function RegistrationStatusBadge({ 
  status, 
  size = 'default', 
  className 
}: RegistrationStatusBadgeProps) {
  const { t } = useI18n();
  const config = EVENT_REGISTRATION_STATUS_CONFIG[status];
  
  // Status desconhecido: Badge neutro sem mostrar status cru
  if (!config) {
    return (
      <Badge 
        variant="outline" 
        className={cn(
          'font-medium border',
          colorVariants.muted,
          sizeVariants[size],
          className
        )}
        data-testid="registration-state-badge"
        data-registration-state={status}
      >
        {t('common.unknown')}
      </Badge>
    );
  }

  const helpKey = HELP_KEY_MAP[status];
  const helpText = helpKey ? t(helpKey) : null;
  // Se a chave de help não existe ou retorna a própria key, não mostra tooltip
  const hasValidHelp = helpText && helpText !== helpKey;

  const badgeElement = (
    <Badge 
      variant="outline"
      className={cn(
        'font-medium border',
        colorVariants[config.color],
        sizeVariants[size],
        className
      )}
      data-testid="registration-state-badge"
      data-registration-state={status}
    >
      {t(config.labelKey as any)}
    </Badge>
  );

  // Se não há help válido, renderiza apenas o badge
  if (!hasValidHelp) {
    return badgeElement;
  }

  // P2.3.1: Tooltip explicativo (hover/focus only)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {badgeElement}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-center">
        <p className="text-sm">{helpText}</p>
      </TooltipContent>
    </Tooltip>
  );
}
