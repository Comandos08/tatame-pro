/**
 * BillingGate - Unified access control based on billing status
 * 
 * P3.2.3 — Frontend Billing Gate Component
 * P3.2.P1 — Hardening & Contract Clarity
 * 
 * LOGIC:
 * - tenant.status !== 'ACTIVE' → Ignore billing (show children)
 * - billing.status in ['TRIALING', 'ACTIVE'] → Allow (show children)
 * - billing.status in ['TRIAL_EXPIRED'] → Partial block (show warning + children)
 * - billing.status in ['PENDING_DELETE', 'CANCELED'] → Full block
 * 
 * CONTRACT:
 * - Never blocks SETUP tenants (onboarding in progress)
 * - Never calls navigate() during render (React-safe)
 * - Explicit status checks (no implicit isBlocked-only reliance)
 * - Shows explicit CTA for resolution
 */

import React, { useEffect, useMemo } from 'react';
import { CreditCard, AlertTriangle, Clock } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { useTenantStatus } from '@/hooks/useTenantStatus';
import { useI18n } from '@/contexts/I18nContext';
import { BlockedStateCard } from '@/components/ux/BlockedStateCard';
import { LoadingState } from '@/components/ux/LoadingState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface BillingGateProps {
  children: React.ReactNode;
  /** If true, blocks entirely in read-only states instead of showing warning */
  strictMode?: boolean;
  /** Custom fallback component for blocked state */
  fallback?: React.ReactNode;
}

export function BillingGate({ children, strictMode = false, fallback }: BillingGateProps) {
  const { tenant } = useTenant();
  const { billingState, isLoading } = useTenantStatus();
  const { t } = useI18n();
  const navigate = useNavigate();

  const isTenantActive = tenant?.status === 'ACTIVE';

  // P3.2.P1 FIX 1 & FIX 2: Explicit status-based blocking logic
  const shouldBlock = useMemo(() => {
    if (!isTenantActive) return false;
    if (isLoading) return false;

    const status = billingState?.status ?? null;
    const blocked = billingState?.isBlocked === true;

    // Full block statuses (EXPLICIT - not relying only on isBlocked)
    return blocked || status === 'PENDING_DELETE' || status === 'CANCELED';
  }, [isTenantActive, isLoading, billingState?.status, billingState?.isBlocked]);

  // P3.2.P1 FIX 1: Navigate via useEffect, never during render
  useEffect(() => {
    if (!shouldBlock) return;
    navigate('/app/billing', { replace: true });
  }, [shouldBlock, navigate]);

  // Ignore billing for non-ACTIVE tenants (still in SETUP)
  if (!isTenantActive) {
    return <>{children}</>;
  }

  if (isLoading) {
    return <LoadingState titleKey="common.loading" />;
  }

  // Allowed states - full access
  if (billingState?.status === 'ACTIVE' || billingState?.status === 'TRIALING') {
    return <>{children}</>;
  }

  // P3.2.P1 FIX 2: Explicit blocked states (PENDING_DELETE, CANCELED, or isBlocked)
  if (shouldBlock) {
    return fallback || (
      <BlockedStateCard
        icon={CreditCard}
        iconVariant="destructive"
        titleKey="billing.gate.blocked.title"
        descriptionKey="billing.gate.blocked.description"
        actions={[
          {
            labelKey: 'billing.gate.blocked.action',
            onClick: () => navigate('/app/billing'),
            variant: 'default',
          },
          {
            labelKey: 'common.goBack',
            onClick: () => navigate(-1),
            variant: 'outline',
          },
        ]}
      />
    );
  }

  // Read-only state (TRIAL_EXPIRED, PAST_DUE)
  if (billingState?.isReadOnly) {
    if (strictMode) {
      return fallback || (
        <BlockedStateCard
          icon={Clock}
          iconVariant="warning"
          titleKey="billing.gate.readonly.title"
          descriptionKey="billing.gate.readonly.description"
          actions={[
            {
              labelKey: 'billing.gate.readonly.action',
              onClick: () => navigate('/app/billing'),
              variant: 'default',
            },
          ]}
        />
      );
    }

    // Non-strict mode: show warning banner + children
    return (
      <>
        <BillingWarningBanner status={billingState?.status ?? null} />
        {children}
      </>
    );
  }

  // Default: allow access
  return <>{children}</>;
}

// P3.2.P1 FIX 3: Clean interface - removed unused daysRemaining prop
interface BillingWarningBannerProps {
  status: string | null;
}

function BillingWarningBanner({ status }: BillingWarningBannerProps) {
  const { t } = useI18n();
  const navigate = useNavigate();

  if (!status) return null;

  const getMessage = () => {
    switch (status) {
      case 'TRIAL_EXPIRED':
        return t('billing.gate.warning.trialExpired');
      case 'PAST_DUE':
        return t('billing.gate.warning.pastDue');
      default:
        return t('billing.gate.warning.generic');
    }
  };

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t('billing.gate.warning.title')}</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>{getMessage()}</span>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => navigate('/app/billing')}
        >
          {t('billing.gate.warning.action')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default BillingGate;
