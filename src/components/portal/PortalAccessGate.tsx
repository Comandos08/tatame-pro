/**
 * P4B-1 — PortalAccessGate (UX-Only)
 * 
 * PURELY VISUAL COMPONENT - Zero navigation, zero redirects
 * P4A (AthleteRouteGuard) handles all access control
 * 
 * This component only:
 * 1. Reads state
 * 2. Shows appropriate UI for each state
 * 3. Renders children when allowed
 */
import React, { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Clock, AlertTriangle, XCircle, HelpCircle, Ban, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';

interface AthleteData {
  id: string;
  full_name: string;
  tenant_id: string;
}

interface MembershipData {
  id: string;
  status: string;
  payment_status: string;
  start_date: string | null;
  end_date: string | null;
  type: string;
  created_at: string;
}

interface PortalAccessGateProps {
  athlete: AthleteData | null;
  membership: MembershipData | null;
  isLoading: boolean;
  error: Error | null;
  children: ReactNode;
}

type GateState = 'loading' | 'error' | 'noAthlete' | 'pendingReview' | 'expired' | 'cancelled' | 'rejected' | 'unknown' | 'allowed';

export function PortalAccessGate({
  athlete,
  membership,
  isLoading,
  error,
  children,
}: PortalAccessGateProps) {
  const { t } = useI18n();
  const { tenantSlug } = useParams();

  const getGateState = (): GateState => {
    if (isLoading) return 'loading';
    if (error) return 'error';
    if (!athlete) return 'noAthlete';
    
    if (!membership) return 'noAthlete';
    
    const status = membership.status?.toUpperCase();
    
    if (status === 'PENDING_REVIEW') return 'pendingReview';
    if (status === 'EXPIRED') return 'expired';
    if (status === 'CANCELLED') return 'cancelled';
    if (status === 'REJECTED') return 'rejected';
    if (status === 'APPROVED' || status === 'ACTIVE') return 'allowed';
    
    // Unknown status - show neutral message
    return 'unknown';
  };

  const gateState = getGateState();

  // P4B-1: NO useEffect, NO navigate() - purely visual component

  if (gateState === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </motion.div>
      </div>
    );
  }

  if (gateState === 'allowed') {
    return <>{children}</>;
  }

  // State configurations with improved, humanized messages
  const stateConfig: Record<Exclude<GateState, 'loading' | 'allowed'>, {
    icon: React.ElementType;
    iconColor: string;
    iconBg: string;
    title: string;
    description: string;
    linkTo?: string;
    ctaLabel?: string;
  }> = {
    error: {
      icon: XCircle,
      iconColor: 'text-destructive',
      iconBg: 'bg-destructive/10',
      title: t('error.loadingFailed'),
      description: t('portal.errorDesc'),
    },
    noAthlete: {
      icon: AlertTriangle,
      iconColor: 'text-amber-500',
      iconBg: 'bg-amber-500/10',
      title: t('portal.noAthleteTitle'),
      description: t('portal.noAthleteDescHumanized'),
      linkTo: `/${tenantSlug}/membership/new`,
      ctaLabel: t('portal.startMembership'),
    },
    pendingReview: {
      icon: Clock,
      iconColor: 'text-amber-500',
      iconBg: 'bg-amber-500/10',
      title: t('portal.pendingReview'),
      description: t('portal.pendingReviewDescHumanized'),
      // No CTA - athlete must wait
    },
    expired: {
      icon: AlertTriangle,
      iconColor: 'text-destructive',
      iconBg: 'bg-destructive/10',
      title: t('portal.expired'),
      description: t('portal.expiredDescHumanized'),
      linkTo: `/${tenantSlug}/membership/renew`,
      ctaLabel: t('renewal.renewNow'),
    },
    cancelled: {
      icon: Ban,
      iconColor: 'text-muted-foreground',
      iconBg: 'bg-muted',
      title: t('portal.cancelled'),
      description: t('portal.cancelledDescHumanized'),
      linkTo: `/${tenantSlug}/membership/new`,
      ctaLabel: t('portal.startNewMembership'),
    },
    rejected: {
      icon: XCircle,
      iconColor: 'text-destructive',
      iconBg: 'bg-destructive/10',
      title: t('portal.rejected'),
      description: t('portal.rejectedDescHumanized'),
      linkTo: `/${tenantSlug}/membership/new`,
      ctaLabel: t('portal.tryAgain'),
    },
    unknown: {
      icon: HelpCircle,
      iconColor: 'text-muted-foreground',
      iconBg: 'bg-muted',
      title: t('portal.unknownStatus'),
      description: t('portal.unknownStatusDesc'),
    },
  };

  const config = stateConfig[gateState];
  const IconComponent = config.icon;

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-8 pb-8 text-center">
            <div
              className={`h-16 w-16 rounded-full ${config.iconBg} flex items-center justify-center mx-auto mb-4`}
            >
              <IconComponent className={`h-8 w-8 ${config.iconColor}`} />
            </div>
            <h2 className="text-xl font-display font-bold mb-2">{config.title}</h2>
            <p className="text-muted-foreground text-sm mb-6">{config.description}</p>
            
            {config.linkTo && config.ctaLabel && (
              <Button asChild className="w-full gap-2">
                <Link to={config.linkTo}>
                  {config.ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
