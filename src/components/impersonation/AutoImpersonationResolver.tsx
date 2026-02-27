/**
 * ============================================================================
 * 🔐 AutoImpersonationResolver — IMPERSONATION STABILITY FIX (SAFE GOLD)
 * ============================================================================
 *
 * PURPOSE:
 * When a SUPERADMIN_GLOBAL navigates directly to a tenant route without an
 * active impersonation session, this component blocks navigation and shows
 * a confirmation button. Impersonation is NEVER started automatically.
 *
 * FLOW:
 * 1. If already impersonating → render children
 * 2. Otherwise → show confirmation UI with "Start Impersonation" button
 * 3. User clicks → resolve slug → startImpersonation(tenantId)
 * 4. On success → render children
 * 5. On failure → show error with recovery options
 *
 * SECURITY INVARIANTS:
 * - startImpersonation is ONLY triggered by explicit user action (button click)
 * - No automatic backend calls on mount
 * - Deterministic state machine: IDLE → RESOLVING → RESOLVED | ERROR
 *
 * SAFE GOLD COMPLIANCE:
 * - No backend changes
 * - No RLS changes
 * - No Edge Function changes
 * - Frontend state fix only
 * ============================================================================
 */

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, RefreshCw, ArrowLeft, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { IdentityLoadingScreen } from '@/components/identity/IdentityLoadingScreen';
import { BlockedStateCard } from '@/components/ux/BlockedStateCard';
import { logger } from '@/lib/logger';

type ResolverStatus = 'IDLE' | 'RESOLVING' | 'RESOLVED' | 'ERROR';

interface AutoImpersonationResolverProps {
  tenantSlug: string;
  children: React.ReactNode;
  onLogout: () => void;
}

export function AutoImpersonationResolver({
  tenantSlug,
  children,
  onLogout,
}: AutoImpersonationResolverProps) {
  const navigate = useNavigate();
  const { startImpersonation, isImpersonating } = useImpersonation();
  const [status, setStatus] = useState<ResolverStatus>('IDLE');
  const inFlightRef = useRef(false);

  // ========================================================================
  // Handler: Explicit user-triggered impersonation start
  // BY DESIGN: Never called automatically — only via button click
  // HARD GUARD: Prevents duplicate calls (429) even under React StrictMode
  // ========================================================================
  const handleStartImpersonation = async () => {
    if (status !== 'IDLE') return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    if (!tenantSlug) {
      logger.warn('[AutoImpersonation] tenantSlug is undefined — blocking');
      setStatus('ERROR');
      return;
    }

    setStatus('RESOLVING');

    try {
      // Step 1: Resolve tenantSlug → tenantId
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('id, name, status')
        .eq('slug', tenantSlug.trim().toLowerCase())
        .maybeSingle();

      if (tenantError) {
        logger.error('[AutoImpersonation] Tenant lookup failed', { tenantSlug, error: tenantError });
        setStatus('ERROR');
        return;
      }

      if (!tenant) {
        logger.warn('[AutoImpersonation] Tenant not found for slug', { tenantSlug });
        setStatus('ERROR');
        return;
      }

      if (tenant.status !== 'ACTIVE') {
        logger.warn('[AutoImpersonation] Tenant is not ACTIVE', { tenantSlug, status: tenant.status });
        setStatus('ERROR');
        return;
      }

      // Step 2: Start impersonation (user-initiated)
      const success = await startImpersonation(tenant.id, `manual_entry:${tenantSlug}`);

      if (success) {
        logger.log('[AutoImpersonation] Impersonation started successfully', { tenantSlug });
        setStatus('RESOLVED');
      } else {
        logger.error('[AutoImpersonation] startImpersonation returned false', { tenantSlug });
        setStatus('ERROR');
      }
    } catch (err) {
      logger.error('[AutoImpersonation] Unexpected error', { tenantSlug, error: err });
      setStatus('ERROR');
    } finally {
      inFlightRef.current = false;
    }
  };

  // ========================================================================
  // Render: State-based deterministic output
  // ========================================================================

  // Already impersonating → render children immediately
  if (isImpersonating) {
    return <>{children}</>;
  }

  switch (status) {
    case 'IDLE':
      // Show confirmation UI — user must click to start
      return (
        <BlockedStateCard
          icon={ShieldAlert}
          iconVariant="warning"
          titleKey="impersonation.autoEntryRequired"
          descriptionKey="impersonation.autoEntryRequiredDesc"
          hintKey="impersonation.autoEntryHint"
          actions={[
            {
              labelKey: 'impersonation.startForTenant',
              onClick: handleStartImpersonation,
              icon: Play,
              disabled: status !== 'IDLE',
            },
            {
              labelKey: 'impersonation.goToAdmin',
              onClick: () => navigate('/admin'),
              icon: ArrowLeft,
            },
          ]}
        />
      );

    case 'RESOLVING':
      return (
        <IdentityLoadingScreen
          onRetry={handleStartImpersonation}
          onLogout={onLogout}
        />
      );

    case 'RESOLVED':
      // Impersonation started — children will render on next cycle when isImpersonating becomes true
      return (
        <IdentityLoadingScreen
          onRetry={handleStartImpersonation}
          onLogout={onLogout}
        />
      );

    case 'ERROR':
      return (
        <BlockedStateCard
          icon={ShieldAlert}
          iconVariant="warning"
          titleKey="impersonation.autoEntryFailed"
          descriptionKey="impersonation.autoEntryFailedDesc"
          hintKey="impersonation.autoEntryHint"
          actions={[
            {
              labelKey: 'impersonation.retry',
              onClick: () => {
                setStatus('IDLE');
              },
              icon: RefreshCw,
            },
            {
              labelKey: 'impersonation.goToAdmin',
              onClick: () => navigate('/admin'),
              icon: ArrowLeft,
            },
          ]}
        />
      );
  }
}
