/**
 * 🔐 ImpersonationContext — Manages Superadmin Impersonation Sessions
 * 
 * This context handles the lifecycle of impersonation sessions:
 * - Stores session state in sessionStorage (not localStorage)
 * - Automatically validates sessions on app load
 * - Handles TTL expiration with automatic cleanup
 * - Provides session management methods
 * 
 * SECURITY RULES:
 * - Sessions are scoped to a single tenant
 * - TTL is enforced (max 60 minutes)
 * - All state is cleared on session end
 * - Backend always validates (never trust frontend alone)
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import { clearImpersonationClientCache } from '@/integrations/supabase/impersonation-client';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from './AuthContext';
import { toast } from 'sonner';
import { useI18n } from './I18nContext';
import { hardResetAuthClientState } from '@/lib/auth/clientReset';

export const IMPERSONATION_STORAGE_KEY = 'tatame_impersonation_session';
const VALIDATION_INTERVAL = 60000; // Validate every minute
const MAX_CONSECUTIVE_VALIDATION_FAILURES = 3;

/**
 * ✅ P-IMP-FIX — State machine for impersonation resolution
 * IDLE: No impersonation in progress
 * RESOLVING: Starting impersonation (edge function call in progress)
 * RESOLVED: Impersonation successfully started and stable
 */
type ImpersonationResolutionStatus = 'IDLE' | 'RESOLVING' | 'RESOLVED';

interface ImpersonationSession {
  impersonationId: string;
  targetTenantId: string;
  targetTenantSlug: string;
  targetTenantName: string;
  expiresAt: string;
  status: 'ACTIVE' | 'ENDED' | 'EXPIRED' | 'REVOKED';
}

interface ImpersonationContextType {
  /** Current impersonation session, if any */
  session: ImpersonationSession | null;
  /** Whether the context is loading/validating */
  isLoading: boolean;
  /** Whether impersonation is currently active */
  isImpersonating: boolean;
  /** The tenant ID being impersonated, if any */
  impersonatedTenantId: string | null;
  /** Remaining time in minutes before session expires */
  remainingMinutes: number | null;
  /** ✅ P-IMP-FIX — Resolution status for gates to respect */
  resolutionStatus: ImpersonationResolutionStatus;
  /** Start a new impersonation session */
  startImpersonation: (targetTenantId: string, reason?: string) => Promise<boolean>;
  /** End the current impersonation session */
  endImpersonation: (reason?: string) => Promise<void>;
  /** A02.T1.4.1: Synchronous in-memory + storage clear (fail-closed) */
  clearSession: () => void;
  /** Check if the given tenant ID matches the impersonated tenant */
  isImpersonatingTenant: (tenantId: string) => boolean;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { isGlobalSuperadmin, isLoading: authLoading } = useCurrentUser();
  
  // Hydrate the session from sessionStorage at construction time so the initial
  // render already reflects any restored impersonation without a setState-in-effect
  // round-trip. Side effects (logging, expired-cleanup) still happen below.
  const initialRestoredSession: ImpersonationSession | null = (() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem(IMPERSONATION_STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as ImpersonationSession;
      if (new Date(parsed.expiresAt) > new Date()) return parsed;
      sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
      return null;
    } catch {
      try { sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY); } catch { /* ignore */ }
      return null;
    }
  })();

  const [session, setSession] = useState<ImpersonationSession | null>(initialRestoredSession);
  const [isLoading, setIsLoading] = useState(false);
  const [remainingMinutes, setRemainingMinutes] = useState<number | null>(null);

  // ✅ P-IMP-FIX — Explicit resolution status state machine
  const [resolutionStatus, setResolutionStatus] = useState<ImpersonationResolutionStatus>(
    initialRestoredSession ? 'RESOLVED' : 'IDLE'
  );

  const expirationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impersonationInFlightRef = useRef(false);
  const consecutiveValidationFailures = useRef(0);

  // One-time log for the restored session — kept as an effect so the log only
  // fires on first mount, not on each re-render.
  useEffect(() => {
    if (initialRestoredSession) {
      logger.log('[IMPERSONATION] Restored session from storage, status → RESOLVED');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: runs once on mount
  }, []);

  // Clear session state and storage
  // IMPORTANT: Defined before validateSession to avoid hoisting issues
  const clearSession = useCallback(() => {
    logger.log('[IMPERSONATION] Clearing session, status → IDLE');
    setSession(null);
    setRemainingMinutes(null);
    setResolutionStatus('IDLE'); // ✅ P-IMP-FIX — Reset to IDLE on clear
    // Storage ops can throw in sandboxed iframes / strict CSP / private mode.
    // In-memory state above is already reset; swallow storage errors so we
    // never leave the UI in a half-cleared state.
    try {
      sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
    } catch (err) {
      logger.warn('[IMPERSONATION] sessionStorage.removeItem failed during clearSession', err);
    }
    if (expirationTimeout.current) clearTimeout(expirationTimeout.current);
    if (warningTimeout.current) clearTimeout(warningTimeout.current);
    // AJUSTE A2: Limpar cache de clients Supabase ao encerrar impersonation
    clearImpersonationClientCache();
  }, []);

  // Calculate remaining time + wall-clock expiry fail-safe.
  //
  // The heartbeat effect below schedules a single setTimeout for the full
  // remaining TTL. Browsers throttle setTimeout aggressively in backgrounded
  // tabs, so when the tab regains focus the timer may fire late — or, in
  // extreme throttling cases, the user could interact with stale impersonated
  // state briefly before the timer catches up.
  //
  // This interval runs every 10s regardless and checks wall-clock time
  // directly. If expiresAt has passed, force-clear. After clearSession the
  // effect re-runs with session=null and short-circuits, so cleanup fires
  // exactly once.
  useEffect(() => {
    if (!session) {
      // Reset derived minute counter when the session is cleared. This is a
      // bookkeeping setState tied to the effect's lifecycle, not cascading state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemainingMinutes(null);
      return;
    }

    const checkExpiry = () => {
      const remainingMs = new Date(session.expiresAt).getTime() - Date.now();
      setRemainingMinutes(Math.max(0, Math.floor(remainingMs / 60000)));

      if (remainingMs <= 0) {
        logger.warn('[IMPERSONATION] Wall-clock expiry detected, forcing cleanup');
        clearSession();
        toast.warning(t('impersonation.sessionExpired'));
        navigate('/admin', { replace: true });
      }
    };

    checkExpiry();
    const interval = setInterval(checkExpiry, 10000);

    return () => clearInterval(interval);
  }, [session, clearSession, navigate, t]);

  // Validate session with backend (cross-verification)
  // BY DESIGN: Updates local session with server-authoritative data
  const validateSession = useCallback(async () => {
    if (!session || !isGlobalSuperadmin) return;

    try {
      const { data, error } = await supabase.functions.invoke('validate-impersonation', {
        body: { impersonationId: session.impersonationId },
      });

      if (error) {
        logger.error('[IMPERSONATION] Validation failed:', error);
        clearSession();
        return;
      }

      // BY DESIGN: Unwrap A07 envelope — data is in data.data when using okResponse
      const payload = data?.data ?? data;

      if (!payload?.valid) {
        logger.log('[IMPERSONATION] Session no longer valid:', payload?.status);
        clearSession();
        toast.warning(t('impersonation.sessionExpired'));
        navigate('/admin', { replace: true });
        return;
      }

      // A02.T1.4: Cross-verify and update session with server-authoritative data
      // BY DESIGN: Server slug/name/expiry overrides local state
      if (payload.targetTenantSlug && payload.targetTenantSlug !== session.targetTenantSlug) {
        logger.warn('[IMPERSONATION] Server slug differs from local, updating', {
          local: session.targetTenantSlug,
          server: payload.targetTenantSlug,
        });
      }

      const updatedSession: ImpersonationSession = {
        ...session,
        targetTenantSlug: payload.targetTenantSlug || session.targetTenantSlug,
        targetTenantName: payload.targetTenantName || session.targetTenantName,
        expiresAt: payload.expiresAt || session.expiresAt,
        status: 'ACTIVE',
      };

      setSession(updatedSession);
      sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(updatedSession));
    } catch (err) {
      logger.error('[IMPERSONATION] Validation error:', err);
      consecutiveValidationFailures.current += 1;
      if (consecutiveValidationFailures.current >= MAX_CONSECUTIVE_VALIDATION_FAILURES) {
        logger.warn('[IMPERSONATION] Too many consecutive validation failures, clearing session');
        clearSession();
        toast.warning(t('impersonation.sessionExpired'));
        navigate('/admin', { replace: true });
      }
      return;
    }
    // Reset failure counter on success
    consecutiveValidationFailures.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps use specific session fields intentionally; subscribing to the full session object would cause re-runs on unrelated state changes
  }, [session?.impersonationId, session?.status, isGlobalSuperadmin, navigate, t, clearSession]);

  // ==========================================================================
  // A02.T1.4.2 — Validation Cadence (Heartbeat Controlado) — SAFE GOLD
  // BY DESIGN: Only runs for SUPERADMIN_GLOBAL with ACTIVE session.
  // Visibility-aware: revalidates immediately when tab regains focus.
  // Fail-closed: invalid response triggers immediate clearSession + redirect.
  // ==========================================================================
  useEffect(() => {
    // GUARD: Only superadmin with active session gets heartbeat
    if (!isGlobalSuperadmin) return;
    if (!session) return;
    if (session.status !== 'ACTIVE') return;

    let cancelled = false;

    const validate = async () => {
      if (cancelled) return;
      await validateSession();
    };

    // Validate immediately on mount/session change
    validate();

    // Periodic heartbeat — exactly 1 interval, deterministic
    const intervalId = setInterval(validate, VALIDATION_INTERVAL);

    // Visibility-aware: revalidate when tab becomes visible again
    // BY DESIGN: Catches server-side revocations that happened while tab was hidden
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        validate();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Clear previous expiration and warning timeouts before creating new ones
    if (expirationTimeout.current) clearTimeout(expirationTimeout.current);
    if (warningTimeout.current) clearTimeout(warningTimeout.current);

    // Set up local expiration timeout (fail-closed)
    const expiresIn = new Date(session.expiresAt).getTime() - Date.now();
    const WARNING_BEFORE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

    if (expiresIn > 0) {
      expirationTimeout.current = setTimeout(() => {
        if (cancelled) return;
        clearSession();
        toast.warning(t('impersonation.sessionExpired'));
        navigate('/admin', { replace: true });
      }, expiresIn);

      // P2-FIX: Warn the user 5 minutes before the session expires so they
      // can save their work or explicitly extend the session.
      if (expiresIn > WARNING_BEFORE_EXPIRY_MS) {
        warningTimeout.current = setTimeout(() => {
          if (cancelled) return;
          toast.warning(t('impersonation.sessionExpiringSoon'));
        }, expiresIn - WARNING_BEFORE_EXPIRY_MS);
      }
    }

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (expirationTimeout.current) clearTimeout(expirationTimeout.current);
      if (warningTimeout.current) clearTimeout(warningTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps use specific session fields intentionally; subscribing to the full session object would cause re-runs on unrelated state changes
  }, [session?.impersonationId, session?.status, isGlobalSuperadmin, validateSession, navigate, t, clearSession]);

  // ==========================================================================
  // A02.T1.5 — Realtime Revocation Channel — SAFE GOLD
  // BY DESIGN: Subscribes to postgres_changes on superadmin_impersonations.
  // Additive layer on top of polling A02.T1.4.2 (fallback preserved).
  // Fail-closed: any non-ACTIVE status triggers immediate clearSession.
  // Single subscription per session. Deterministic cleanup.
  // ==========================================================================
  useEffect(() => {
    if (!isGlobalSuperadmin) return;
    if (!session) return;
    if (session.status !== 'ACTIVE') return;
    if (!session.impersonationId) return;

    let cancelled = false;

    const channelName = `impersonation:${session.impersonationId}`;

    const handleRevocation = (reason: string, payload?: Record<string, unknown>) => {
      if (cancelled) return;

      logger.warn('[IMPERSONATION] Realtime revocation detected', { reason, status: payload?.status });

      // 1️⃣ Fail-closed: clear in-memory immediately
      clearSession();

      // 2️⃣ Redundant storage clear (belt-and-suspenders)
      try {
        sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }

      // 3️⃣ Notify user
      toast.warning(t('impersonation.sessionExpired'));

      // 4️⃣ Navigate to admin
      navigate('/admin', { replace: true });
    };

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'superadmin_impersonations',
          filter: `id=eq.${session.impersonationId}`,
        },
        (payload) => {
          if (cancelled) return;
          const newRow = payload.new as Record<string, unknown> | undefined;
          if (!newRow) {
            handleRevocation('UPDATE_NO_PAYLOAD');
            return;
          }
          if (newRow.status && newRow.status !== 'ACTIVE') {
            handleRevocation('STATUS_CHANGED', newRow);
            return;
          }
          if (newRow.ended_at) {
            handleRevocation('ENDED_AT_SET', newRow);
            return;
          }
          if (newRow.expires_at && new Date(newRow.expires_at as string).getTime() < Date.now()) {
            handleRevocation('EXPIRED_SERVER', newRow);
            return;
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'superadmin_impersonations',
          filter: `id=eq.${session.impersonationId}`,
        },
        () => {
          if (cancelled) return;
          handleRevocation('ROW_DELETED');
        },
      )
      .subscribe((status) => {
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          logger.warn('[IMPERSONATION] Realtime channel degraded, polling fallback active', { status });
        }
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps use specific session fields intentionally; subscribing to the full session object would cause re-runs on unrelated state changes
  }, [session?.impersonationId, session?.status, isGlobalSuperadmin, clearSession, navigate, t]);

  // Start impersonation
  const startImpersonation = useCallback(async (targetTenantId: string, reason?: string): Promise<boolean> => {
    if (!isGlobalSuperadmin) {
      logger.error('[IMPERSONATION] Cannot start: not a superadmin');
      return false;
    }

    // HARD GUARD: Prevent duplicate edge function calls (429 protection)
    if (impersonationInFlightRef.current) {
      logger.warn('[IMPERSONATION] Duplicate call blocked by inFlightRef');
      return false;
    }
    impersonationInFlightRef.current = true;

    // ✅ P-IMP-FIX — Set RESOLVING before edge function call
    logger.log('[IMPERSONATION] Starting, status → RESOLVING');
    setResolutionStatus('RESOLVING');

    try {
      const { data, error } = await supabase.functions.invoke('start-impersonation', {
        body: { targetTenantId, reason },
      });

      if (error) {
        logger.error('[IMPERSONATION] Start failed:', error);
        setResolutionStatus('IDLE'); // ✅ P-IMP-FIX — Reset on failure
        toast.error(t('impersonation.startFailed'));
        return false;
      }

      // A07 envelope unwrap — okResponse wraps in { data: { ... } }
      const payload = data?.data ?? data;

      if (payload.error) {
        logger.error('[IMPERSONATION] Start failed:', payload.error);
        setResolutionStatus('IDLE'); // ✅ P-IMP-FIX — Reset on failure
        toast.error(payload.error);
        return false;
      }

      const newSession: ImpersonationSession = {
        impersonationId: payload.impersonationId,
        targetTenantId: payload.targetTenantId,
        targetTenantSlug: payload.targetTenantSlug,
        targetTenantName: payload.targetTenantName,
        expiresAt: payload.expiresAt,
        status: 'ACTIVE',
      };

      setSession(newSession);
      sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(newSession));

      // ✅ P-IMP-FIX — Mark as RESOLVED only after session is set
      logger.log('[IMPERSONATION] Success, status → RESOLVED');
      setResolutionStatus('RESOLVED');

      // P1-FIX: Reset all tenant-scoped caches so the impersonated tenant's
      // data is fetched fresh. Without this, stale caches from the previous
      // context (superadmin's own session) persist until TTL expires.
      hardResetAuthClientState(queryClient);

      toast.success(`${t('impersonation.started')}: ${payload.targetTenantName}`);
      return true;
    } catch (err) {
      logger.error('[IMPERSONATION] Start error:', err);
      setResolutionStatus('IDLE'); // ✅ P-IMP-FIX — Reset on error
      toast.error(t('impersonation.startFailed'));
      return false;
    } finally {
      impersonationInFlightRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryClient from useQueryClient() is a stable singleton per TanStack Query design
  }, [isGlobalSuperadmin, t]);

  // End impersonation
  const endImpersonation = useCallback(async (reason?: string) => {
    if (!session) return;

    try {
      const { error } = await supabase.functions.invoke('end-impersonation', {
        body: { impersonationId: session.impersonationId, reason },
      });

      if (error) {
        logger.error('[IMPERSONATION] End failed:', error);
      }
    } catch (err) {
      logger.error('[IMPERSONATION] End error:', err);
    } finally {
      clearSession();
      hardResetAuthClientState(queryClient);
      navigate('/admin', { replace: true });
      toast.info(t('impersonation.ended'));
    }
  }, [session, clearSession, queryClient, navigate, t]);

  // Check if impersonating a specific tenant
  const isImpersonatingTenant = useCallback((tenantId: string): boolean => {
    return session?.targetTenantId === tenantId && session?.status === 'ACTIVE';
  }, [session]);

  const value: ImpersonationContextType = {
    session,
    isLoading: isLoading || authLoading,
    isImpersonating: !!session && session.status === 'ACTIVE',
    impersonatedTenantId: session?.targetTenantId || null,
    remainingMinutes,
    resolutionStatus, // ✅ P-IMP-FIX — Expose resolution status
    startImpersonation,
    endImpersonation,
    clearSession, // A02.T1.4.1 — Exposed for fail-closed scope clearing
    isImpersonatingTenant,
  };

  return (
    <ImpersonationContext.Provider value={value}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation(): ImpersonationContextType {
  const context = useContext(ImpersonationContext);
  if (!context) {
    throw new Error('useImpersonation must be used within an ImpersonationProvider');
  }
  return context;
}
