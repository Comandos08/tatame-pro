/**
 * 🔍 HealthStatusIndicator — P4.1.B
 * 
 * Visual indicator for system health status (OK/DEGRADED/CRITICAL).
 */

import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, HelpCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HealthStatus } from '@/types/observability';
import { useI18n } from '@/contexts/I18nContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface HealthStatusIndicatorProps {
  status: HealthStatus;
  label?: string;
  reason?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  isLoading?: boolean;
}

const statusConfig: Record<HealthStatus, {
  icon: React.ElementType;
  colorClass: string;
  labelKey: string;
}> = {
  OK: {
    icon: CheckCircle,
    colorClass: 'text-success',
    labelKey: 'observability.status.ok',
  },
  DEGRADED: {
    icon: AlertTriangle,
    colorClass: 'text-warning',
    labelKey: 'observability.status.degraded',
  },
  CRITICAL: {
    icon: XCircle,
    colorClass: 'text-destructive',
    labelKey: 'observability.status.critical',
  },
  UNKNOWN: {
    icon: HelpCircle,
    colorClass: 'text-muted-foreground',
    labelKey: 'observability.status.unknown',
  },
};

const sizeConfig = {
  sm: { icon: 'h-4 w-4', text: 'text-xs' },
  md: { icon: 'h-5 w-5', text: 'text-sm' },
  lg: { icon: 'h-6 w-6', text: 'text-base' },
};

export function HealthStatusIndicator({
  status,
  label,
  reason,
  showLabel = true,
  size = 'md',
  className,
  isLoading = false,
}: HealthStatusIndicatorProps) {
  const { t } = useI18n();
  const config = statusConfig[status];
  const sizes = sizeConfig[size];
  const Icon = config.icon;
  
  const displayLabel = label || t(config.labelKey);
  
  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Loader2 className={cn(sizes.icon, 'animate-spin text-muted-foreground')} />
        {showLabel && (
          <span className={cn(sizes.text, 'text-muted-foreground')}>
            {t('common.loading')}
          </span>
        )}
      </div>
    );
  }
  
  const indicator = (
    <div className={cn('flex items-center gap-2', className)}>
      <Icon className={cn(sizes.icon, config.colorClass)} />
      {showLabel && (
        <span className={cn(sizes.text, 'font-medium', config.colorClass)}>
          {displayLabel}
        </span>
      )}
    </div>
  );
  
  if (reason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {indicator}
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">{reason}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return indicator;
}

// Compact badge variant
export function HealthStatusBadge({
  status,
  className,
}: {
  status: HealthStatus;
  className?: string;
}) {
  const { t } = useI18n();
  const config = statusConfig[status];
  const Icon = config.icon;
  
  const bgColors: Record<HealthStatus, string> = {
    OK: 'bg-success/10 text-success border-success/20',
    DEGRADED: 'bg-warning/10 text-warning border-warning/20',
    CRITICAL: 'bg-destructive/10 text-destructive border-destructive/20',
    UNKNOWN: 'bg-muted text-muted-foreground border-muted-foreground/20',
  };
  
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium',
      bgColors[status],
      className
    )}>
      <Icon className="h-3 w-3" />
      <span>{t(config.labelKey)}</span>
    </div>
  );
}
