/**
 * ============================================================================
 * 🔐 AutoImpersonationResolver — IMPERSONATION-ENTRY-FLOW-FIX (SAFE GOLD)
 * ============================================================================
 *
 * PURPOSE:
 * Automatically starts an impersonation session when a SUPERADMIN_GLOBAL
 * navigates directly to a tenant route (/:tenantSlug/app) without an active
 * impersonation session.
 *
 * FLOW:
 * 1. Resolve tenantSlug from URL → tenantId via DB lookup
 * 2. Call startImpersonation(tenantId)
 * 3. On success → render children (navigation continues)
 * 4. On failure → show blocked card with recovery options
 *
 * SECURITY INVARIANTS:
 * - Only executes for SUPERADMIN_GLOBAL (caller must guard)
 * - If tenantSlug is missing or undefined → logs warning, blocks gracefully
 * - Never calls validate-impersonation with undefined slug
 * - Deterministic state machine: IDLE → RESOLVING → RESOLVED | ERROR
 *
 * SAFE GOLD COMPLIANCE:
 * - No backend changes
 * - No RLS changes
 * - No Edge Function changes
 * - Frontend state fix only
 * ============================================================================
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, RefreshCw, ArrowLeft } from 'lucide-react';
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
  const [_errorMessage, setErrorMessage] = useState<string | null>(null);
  const attemptedRef = useRef(false);

  // ========================================================================
  // Guard: tenantSlug must be defined
  // BY DESIGN: If slug is missing, we block gracefully — never call backend
  // ========================================================================
  const resolveImpersonation = useCallback(async () => {
    if (!tenantSlug) {
      logger.warn('[AutoImpersonation] tenantSlug is undefined — blocking navigation');
      setStatus('ERROR');
      setErrorMessage('MISSING_TENANT_SLUG');
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
        setErrorMessage('TENANT_LOOKUP_FAILED');
        return;
      }

      if (!tenant) {
        logger.warn('[AutoImpersonation] Tenant not found for slug', { tenantSlug });
        setStatus('ERROR');
        setErrorMessage('TENANT_NOT_FOUND');
        return;
      }

      if (tenant.status !== 'ACTIVE') {
        logger.warn('[AutoImpersonation] Tenant is not ACTIVE', { tenantSlug, status: tenant.status });
        setStatus('ERROR');
        setErrorMessage('TENANT_INACTIVE');
        return;
      }

      // Step 2: Start impersonation
      const success = await startImpersonation(tenant.id, `auto_entry:${tenantSlug}`);

      if (success) {
        logger.log('[AutoImpersonation] Impersonation started successfully', { tenantSlug });
        setStatus('RESOLVED');
      } else {
        logger.error('[AutoImpersonation] startImpersonation returned false', { tenantSlug });
        setStatus('ERROR');
        setErrorMessage('IMPERSONATION_START_FAILED');
      }
    } catch (err) {
      logger.error('[AutoImpersonation] Unexpected error', { tenantSlug, error: err });
      setStatus('ERROR');
      setErrorMessage('UNEXPECTED_ERROR');
    }
  }, [tenantSlug, startImpersonation]);

  // ========================================================================
  // Effect: Auto-resolve on mount (once)
  // BY DESIGN: Uses ref to prevent double-execution in StrictMode
  // ========================================================================
  useEffect(() => {
    if (attemptedRef.current) return;
    if (isImpersonating) return; // Already impersonating, skip

    attemptedRef.current = true;
    resolveImpersonation();
  }, [resolveImpersonation, isImpersonating]);

  // ========================================================================
  // Render: State-based deterministic output
  // ========================================================================

  // Already impersonating (e.g. resolved successfully or restored from storage)
  if (isImpersonating) {
    return <>{children}</>;
  }

  switch (status) {
    case 'IDLE':
    case 'RESOLVING':
      return (
        <IdentityLoadingScreen
          onRetry={() => {
            attemptedRef.current = false;
            resolveImpersonation();
          }}
          onLogout={onLogout}
        />
      );

    case 'RESOLVED':
      // Impersonation started — children will render on next cycle when isImpersonating becomes true
      return (
        <IdentityLoadingScreen
          onRetry={() => {
            attemptedRef.current = false;
            resolveImpersonation();
          }}
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
                attemptedRef.current = false;
                setStatus('IDLE');
                setErrorMessage(null);
                resolveImpersonation();
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
