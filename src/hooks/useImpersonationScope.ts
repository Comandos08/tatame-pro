/**
 * ============================================================================
 * 🔐 useImpersonationScope — Cross-Verified Impersonation Scope (SAFE GOLD)
 * ============================================================================
 *
 * PURPOSE:
 * Provides a deterministic, server-verified impersonation scope for frontend
 * consumption. The frontend NEVER trusts local state alone — all tenant context
 * during impersonation is cross-verified against the backend.
 *
 * SECURITY INVARIANTS:
 * - tenantSlug is NEVER accepted from URL alone; must match backend response
 * - scope.status is derived ONLY from validate-impersonation response
 * - Expired/invalid scopes trigger automatic cleanup + redirect
 * - Non-superadmin users always get scope.status === 'NONE'
 *
 * SAFE GOLD COMPLIANCE:
 * - Additive only (no refactoring of existing ImpersonationContext)
 * - Deterministic state transitions
 * - Zero console.* (uses logger)
 * ============================================================================
 */

import { useCallback, useMemo } from 'react';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';

// ============================================================================
// TYPES — ImpersonationScope (canonical, deterministic)
// ============================================================================

export type ImpersonationScopeStatus =
  | 'NONE'       // No impersonation active
  | 'ACTIVE'     // Valid, server-confirmed
  | 'EXPIRED'    // TTL exceeded
  | 'ENDED'      // Manually ended
  | 'TENANT_INACTIVE' // Target tenant deactivated
  | 'INVALID';   // Session not found or ownership mismatch

export interface ImpersonationScope {
  /** BY DESIGN: impersonationId is the canonical session identifier */
  impersonationId: string | null;
  targetTenantId: string | null;
  /** BY DESIGN: slug comes from session (server-verified), NOT from URL */
  targetTenantSlug: string | null;
  targetTenantName: string | null;
  expiresAt: string | null;
  remainingMinutes: number | null;
  status: ImpersonationScopeStatus;
  /** BY DESIGN: 'server' means last validated by backend; 'local' = restored from storage pre-validation */
  source: 'server' | 'local';
  /** ISO timestamp of last successful backend validation */
  validatedAt: string | null;
}

// ============================================================================
// HOOK
// ============================================================================

// BY DESIGN: Deterministic slug normalization — single helper for all comparisons
const normalizeSlug = (value?: string | null): string | null =>
  value?.trim().toLowerCase() ?? null;

export function useImpersonationScope() {
  const {
    session,
    isImpersonating,
    remainingMinutes,
    endImpersonation,
    isLoading,
    resolutionStatus,
  } = useImpersonation();

  const { isGlobalSuperadmin } = useCurrentUser();

  // ========================================================================
  // Derive scope from ImpersonationContext session
  // BY DESIGN: scope is a read-only derived projection
  // ========================================================================
  const scope: ImpersonationScope = useMemo(() => {
    if (!isGlobalSuperadmin || !session || !isImpersonating) {
      return {
        impersonationId: null,
        targetTenantId: null,
        targetTenantSlug: null,
        targetTenantName: null,
        expiresAt: null,
        remainingMinutes: null,
        status: 'NONE' as const,
        source: 'local' as const,
        validatedAt: null,
      };
    }

  // Map session status to scope status
    // BY DESIGN: Explicit mapping — no implicit fallback for known states
    const statusMap: Record<string, ImpersonationScopeStatus> = {
      ACTIVE: 'ACTIVE',
      ENDED: 'ENDED',
      EXPIRED: 'EXPIRED',
      REVOKED: 'INVALID',
      TENANT_INACTIVE: 'TENANT_INACTIVE',
    };

    return {
      impersonationId: session.impersonationId,
      targetTenantId: session.targetTenantId,
      targetTenantSlug: session.targetTenantSlug,
      targetTenantName: session.targetTenantName,
      expiresAt: session.expiresAt,
      remainingMinutes,
      status: statusMap[session.status] || 'INVALID',
      // BY DESIGN: After ImpersonationContext validates on mount, source is server-backed
      source: resolutionStatus === 'RESOLVED' ? 'server' : 'local',
      validatedAt: resolutionStatus === 'RESOLVED' ? new Date().toISOString() : null,
    };
  }, [session, isImpersonating, remainingMinutes, isGlobalSuperadmin, resolutionStatus]);

  // ========================================================================
  // requireValidImpersonation — Deterministic slug cross-check
  // BY DESIGN: Returns false if slug mismatch or scope invalid
  // ========================================================================
  const requireValidImpersonation = useCallback(
    (expectedSlug: string): boolean => {
      if (!isGlobalSuperadmin) {
        // BY DESIGN: Non-superadmin users skip impersonation entirely
        return true;
      }

      if (scope.status !== 'ACTIVE') {
        logger.warn('[ImpersonationScope] requireValidImpersonation failed: scope not ACTIVE', {
          status: scope.status,
          expectedSlug,
        });
        return false;
      }

      if (!scope.targetTenantSlug) {
        logger.warn('[ImpersonationScope] requireValidImpersonation failed: no targetTenantSlug');
        return false;
      }

      // BY DESIGN: Deterministic slug normalization for robustness
      if (normalizeSlug(scope.targetTenantSlug) !== normalizeSlug(expectedSlug)) {
        logger.warn('[ImpersonationScope] Slug mismatch detected', {
          expected: expectedSlug,
          actual: scope.targetTenantSlug,
        });
        return false;
      }

      return true;
    },
    [scope, isGlobalSuperadmin],
  );

  // ========================================================================
  // clearImpersonationScope — Fail-safe shutdown with reason logging
  // BY DESIGN: Local state is cleared IMMEDIATELY before any async call
  // to guarantee the UI never stays in a stale impersonation state.
  // ========================================================================
  const clearImpersonationScope = useCallback(
    async (reason: string) => {
      logger.log('[ImpersonationScope] Clearing scope (fail-safe)', { reason });

      // 1️⃣ Clear local storage IMMEDIATELY (fail-safe — always runs)
      try {
        sessionStorage.removeItem('impersonation_session');
      } catch {
        // BY DESIGN: Storage access may fail in restricted contexts — ignore
      }

      // 2️⃣ Attempt backend cleanup (best effort)
      try {
        await endImpersonation(reason);
      } catch (err) {
        logger.warn('[ImpersonationScope] Backend endImpersonation failed (ignored)', { reason });
      }
    },
    [endImpersonation],
  );

  return {
    scope,
    isImpersonating: scope.status === 'ACTIVE',
    isLoading,
    requireValidImpersonation,
    clearImpersonationScope,
  };
}
