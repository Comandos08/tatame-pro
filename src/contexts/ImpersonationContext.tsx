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

const STORAGE_KEY = 'tatame_impersonation_session';
const VALIDATION_INTERVAL = 60000; // Validate every minute

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
  
  const [session, setSession] = useState<ImpersonationSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [remainingMinutes, setRemainingMinutes] = useState<number | null>(null);
  
  // ✅ P-IMP-FIX — Explicit resolution status state machine
  const [resolutionStatus, setResolutionStatus] = useState<ImpersonationResolutionStatus>('IDLE');
  
  const expirationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impersonationInFlightRef = useRef(false);

  // Load session from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ImpersonationSession;
        // Quick local expiration check before validation
        if (new Date(parsed.expiresAt) > new Date()) {
          logger.log('[IMPERSONATION] Restored session from storage, status → RESOLVED');
          setSession(parsed);
          setResolutionStatus('RESOLVED'); // ✅ P-IMP-FIX — Restored sessions are already resolved
        } else {
          // Already expired locally, clear it
          logger.log('[IMPERSONATION] Session expired in storage, clearing');
          sessionStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  // Calculate remaining time
  useEffect(() => {
    if (!session) {
      setRemainingMinutes(null);
      return;
    }

    const updateRemaining = () => {
      const now = new Date();
      const expires = new Date(session.expiresAt);
      const remaining = Math.floor((expires.getTime() - now.getTime()) / 60000);
      setRemainingMinutes(Math.max(0, remaining));
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [session]);

  // Clear session state and storage
  // IMPORTANT: Defined before validateSession to avoid hoisting issues
  const clearSession = useCallback(() => {
    logger.log('[IMPERSONATION] Clearing session, status → IDLE');
    setSession(null);
    setRemainingMinutes(null);
    setResolutionStatus('IDLE'); // ✅ P-IMP-FIX — Reset to IDLE on clear
    sessionStorage.removeItem(STORAGE_KEY);
    if (expirationTimeout.current) clearTimeout(expirationTimeout.current);
    // AJUSTE A2: Limpar cache de clients Supabase ao encerrar impersonation
    clearImpersonationClientCache();
  }, []);

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
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSession));
    } catch (err) {
      logger.error('[IMPERSONATION] Validation error:', err);
    }
  }, [session, isGlobalSuperadmin, navigate, t, clearSession]);

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

    // Set up local expiration timeout (fail-closed)
    const expiresIn = new Date(session.expiresAt).getTime() - Date.now();
    if (expiresIn > 0) {
      expirationTimeout.current = setTimeout(() => {
        if (cancelled) return;
        clearSession();
        toast.warning(t('impersonation.sessionExpired'));
        navigate('/admin', { replace: true });
      }, expiresIn);
    }

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (expirationTimeout.current) clearTimeout(expirationTimeout.current);
    };
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
        sessionStorage.removeItem(STORAGE_KEY);
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
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
      
      // ✅ P-IMP-FIX — Mark as RESOLVED only after session is set
      logger.log('[IMPERSONATION] Success, status → RESOLVED');
      setResolutionStatus('RESOLVED');

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
