import React from 'react';
import { Badge } from '@/components/ui/badge';
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

/**
 * RegistrationStatusBadge
 * 
 * Componente UX puro que traduz status técnico de inscrição → badge visual.
 * 
 * REGRAS P2.3:
 * - Usa SOMENTE i18n (sem fallback hardcoded)
 * - Status desconhecido → Badge neutro com t('common.unknown')
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
      >
        {t('common.unknown')}
      </Badge>
    );
  }

  return (
    <Badge 
      variant="outline"
      className={cn(
        'font-medium border',
        colorVariants[config.color],
        sizeVariants[size],
        className
      )}
    >
      {t(config.labelKey as any)}
    </Badge>
  );
}
