import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { EventStatus, EVENT_STATUS_CONFIG, EventStatusColor } from '@/types/event';
import { useI18n } from '@/contexts/I18nContext';

interface EventStatusBadgeProps {
  status: EventStatus;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

const colorVariants: Record<EventStatusColor, string> = {
  muted: 'bg-muted text-muted-foreground border-muted',
  info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  success: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  warning: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
};

const sizeVariants = {
  sm: 'text-xs px-2 py-0.5',
  default: 'text-sm px-2.5 py-0.5',
  lg: 'text-base px-3 py-1',
};

export function EventStatusBadge({ status, size = 'default', className }: EventStatusBadgeProps) {
  const { t } = useI18n();
  const config = EVENT_STATUS_CONFIG[status];
  
  // Try to get translated label, fallback to default
  const label = t(config.labelKey as any) !== config.labelKey 
    ? t(config.labelKey as any) 
    : config.label;

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
      {label}
    </Badge>
  );
}
