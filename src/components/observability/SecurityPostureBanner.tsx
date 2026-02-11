/**
 * 🔐 SecurityPostureBanner — O01.1 SAFE GOLD
 * 
 * Summary banner for /admin/health showing security posture.
 * CTA navigates to /admin/security.
 * READ-ONLY — Zero mutations.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, AlertTriangle, XCircle, HelpCircle, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { cn } from '@/lib/utils';
import { useSecurityPosture, type SecurityPostureState } from '@/hooks/admin/useSecurityPosture';

const bannerConfig: Record<Exclude<SecurityPostureState, 'LOADING'>, {
  icon: React.ElementType;
  bgClass: string;
  borderClass: string;
  iconClass: string;
  textClass: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
}> = {
  OK: {
    icon: Shield,
    bgClass: 'bg-success/5',
    borderClass: 'border-success/20',
    iconClass: 'text-success',
    textClass: 'text-success',
    title: 'Security Posture: Healthy',
    subtitle: 'No critical or high-risk findings detected.',
    ctaLabel: 'View Security Details',
  },
  WARNING: {
    icon: AlertTriangle,
    bgClass: 'bg-warning/5',
    borderClass: 'border-warning/20',
    iconClass: 'text-warning',
    textClass: 'text-warning',
    title: 'Security Posture: Attention Required',
    subtitle: 'High-risk findings detected. Review recommended.',
    ctaLabel: 'Review Findings',
  },
  CRITICAL: {
    icon: XCircle,
    bgClass: 'bg-destructive/5',
    borderClass: 'border-destructive/20',
    iconClass: 'text-destructive',
    textClass: 'text-destructive',
    title: 'Security Posture: Critical',
    subtitle: 'Critical security findings require immediate attention.',
    ctaLabel: 'Immediate Attention Required',
  },
  ERROR: {
    icon: HelpCircle,
    bgClass: 'bg-muted/50',
    borderClass: 'border-muted-foreground/20',
    iconClass: 'text-muted-foreground',
    textClass: 'text-muted-foreground',
    title: 'Security Audit Unavailable',
    subtitle: 'Unable to retrieve security posture at this time.',
    ctaLabel: 'View Security Details',
  },
};

export function SecurityPostureBanner({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { postureState } = useSecurityPosture();

  if (postureState === 'LOADING') {
    return (
      <div
        className={cn(
          'rounded-lg border px-6 py-4 flex items-center gap-4 bg-muted/30 border-muted-foreground/10',
          className,
        )}
        data-testid="security-posture-banner"
        data-security-posture="LOADING"
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading security posture…</p>
      </div>
    );
  }

  const config = bannerConfig[postureState];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'rounded-lg border px-6 py-4 flex items-center gap-4',
        config.bgClass,
        config.borderClass,
        className,
      )}
      data-testid="security-posture-banner"
      data-security-posture={postureState}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn('h-8 w-8 shrink-0', config.iconClass)} />
      <div className="flex-1">
        <p className={cn('font-display text-base font-semibold', config.textClass)}>
          {config.title}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          {config.subtitle}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate('/admin/security')}
        className="shrink-0"
      >
        {config.ctaLabel}
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}
