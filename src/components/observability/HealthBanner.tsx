/**
 * 🏛️ HealthBanner — PI E3.1
 * 
 * Institutional health status banner for /admin/health.
 * Communicates system state declaratively — no actions, no corrections.
 * SAFE GOLD: Read-only, no flow decisions.
 */

import React from 'react';
import { Shield, AlertTriangle, XCircle } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/utils';
import type { HealthStatus } from '@/types/observability';

interface HealthBannerProps {
  status: HealthStatus;
  className?: string;
}

const bannerConfig: Record<HealthStatus, {
  icon: React.ElementType;
  bgClass: string;
  borderClass: string;
  iconClass: string;
  textClass: string;
  messageKey: string;
  subtitleKey: string;
}> = {
  OK: {
    icon: Shield,
    bgClass: 'bg-success/5',
    borderClass: 'border-success/20',
    iconClass: 'text-success',
    textClass: 'text-success',
    messageKey: 'observability.banner.ok',
    subtitleKey: 'observability.banner.okSubtitle',
  },
  DEGRADED: {
    icon: AlertTriangle,
    bgClass: 'bg-warning/5',
    borderClass: 'border-warning/20',
    iconClass: 'text-warning',
    textClass: 'text-warning',
    messageKey: 'observability.banner.warning',
    subtitleKey: 'observability.banner.warningSubtitle',
  },
  CRITICAL: {
    icon: XCircle,
    bgClass: 'bg-destructive/5',
    borderClass: 'border-destructive/20',
    iconClass: 'text-destructive',
    textClass: 'text-destructive',
    messageKey: 'observability.banner.critical',
    subtitleKey: 'observability.banner.criticalSubtitle',
  },
  UNKNOWN: {
    icon: Shield,
    bgClass: 'bg-muted/50',
    borderClass: 'border-muted-foreground/20',
    iconClass: 'text-muted-foreground',
    textClass: 'text-muted-foreground',
    messageKey: 'observability.banner.unknown',
    subtitleKey: 'observability.banner.unknownSubtitle',
  },
};

export function HealthBanner({ status, className }: HealthBannerProps) {
  const { t } = useI18n();
  const config = bannerConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'rounded-lg border px-6 py-4 flex items-center gap-4',
        config.bgClass,
        config.borderClass,
        className,
      )}
      data-testid="health-banner"
      data-health-banner-status={status}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn('h-8 w-8 shrink-0', config.iconClass)} />
      <div>
        <p className={cn('font-display text-base font-semibold', config.textClass)}>
          {t(config.messageKey)}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t(config.subtitleKey)}
        </p>
      </div>
    </div>
  );
}
