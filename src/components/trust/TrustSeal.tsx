/**
 * 🛡️ TrustSeal — Institutional Trust Signal Component
 * 
 * Provides standardized visual credibility signals for public-facing pages.
 * Designed to be neutral, institutional, and legally defensible.
 * 
 * Usage:
 * - Public document verification pages
 * - Digital cards and diplomas
 * - Public event pages
 * 
 * PI-P7.5: Trust UX & Institutional Signals
 */

import React from 'react';
import { Shield, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TrustSealVariant = 'verified' | 'info' | 'neutral';

interface TrustSealProps {
  /** The trust message to display */
  message: string;
  /** Optional source of truth label */
  source?: string;
  /** Visual variant */
  variant?: TrustSealVariant;
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md';
}

const variantConfig: Record<TrustSealVariant, { icon: typeof Shield; iconClass: string }> = {
  verified: {
    icon: CheckCircle2,
    iconClass: 'text-primary',
  },
  info: {
    icon: Info,
    iconClass: 'text-muted-foreground',
  },
  neutral: {
    icon: Shield,
    iconClass: 'text-muted-foreground',
  },
};

export function TrustSeal({
  message,
  source,
  variant = 'neutral',
  className,
  size = 'sm',
}: TrustSealProps) {
  const config = variantConfig[variant];
  const IconComponent = config.icon;

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
  };

  const iconSizes = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1 text-muted-foreground',
        sizeClasses[size],
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        <IconComponent className={cn(iconSizes[size], config.iconClass)} />
        <span>{message}</span>
      </div>
      {source && (
        <span className="text-[10px] opacity-70">
          {source}
        </span>
      )}
    </div>
  );
}

/**
 * Compact inline variant for use within cards or data rows
 */
export function TrustSealInline({
  message,
  variant = 'neutral',
  className,
}: Omit<TrustSealProps, 'source' | 'size'>) {
  const config = variantConfig[variant];
  const IconComponent = config.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 text-xs text-muted-foreground',
        className
      )}
    >
      <IconComponent className={cn('h-3 w-3', config.iconClass)} />
      <span>{message}</span>
    </div>
  );
}
