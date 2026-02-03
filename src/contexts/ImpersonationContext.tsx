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
import { clearImpersonationClientCache } from '@/integrations/supabase/impersonation-client';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from './AuthContext';
import { toast } from 'sonner';
import { useI18n } from './I18nContext';

const STORAGE_KEY = 'tatame_impersonation_session';
const VALIDATION_INTERVAL = 60000; // Validate every minute

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
  /** Start a new impersonation session */
  startImpersonation: (targetTenantId: string, reason?: string) => Promise<boolean>;
  /** End the current impersonation session */
  endImpersonation: (reason?: string) => Promise<void>;
  /** Check if the given tenant ID matches the impersonated tenant */
  isImpersonatingTenant: (tenantId: string) => boolean;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { isGlobalSuperadmin, isLoading: authLoading } = useCurrentUser();
  
  const [session, setSession] = useState<ImpersonationSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [remainingMinutes, setRemainingMinutes] = useState<number | null>(null);
  
  const validationInterval = useRef<NodeJS.Timeout | null>(null);
  const expirationTimeout = useRef<NodeJS.Timeout | null>(null);

  // Load session from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ImpersonationSession;
        // Quick local expiration check before validation
        if (new Date(parsed.expiresAt) > new Date()) {
          setSession(parsed);
        } else {
          // Already expired locally, clear it
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
    setSession(null);
    setRemainingMinutes(null);
    sessionStorage.removeItem(STORAGE_KEY);
    if (validationInterval.current) clearInterval(validationInterval.current);
    if (expirationTimeout.current) clearTimeout(expirationTimeout.current);
    // AJUSTE A2: Limpar cache de clients Supabase ao encerrar impersonation
    clearImpersonationClientCache();
  }, []);

  // Validate session with backend
  const validateSession = useCallback(async () => {
    if (!session || !isGlobalSuperadmin) return;

    try {
      const { data, error } = await supabase.functions.invoke('validate-impersonation', {
        body: { impersonationId: session.impersonationId },
      });

      if (error) {
        console.error('[IMPERSONATION] Validation failed:', error);
        clearSession();
        return;
      }

      if (!data.valid) {
        console.log('[IMPERSONATION] Session no longer valid:', data.status);
        clearSession();
        toast.warning(t('impersonation.sessionExpired'));
        navigate('/admin', { replace: true });
      }
    } catch (err) {
      console.error('[IMPERSONATION] Validation error:', err);
    }
  }, [session, isGlobalSuperadmin, navigate, t, clearSession]);

  // Set up validation interval
  useEffect(() => {
    if (!session) return;

    // Validate immediately
    validateSession();

    // Then validate periodically
    validationInterval.current = setInterval(validateSession, VALIDATION_INTERVAL);

    // Set up expiration timeout
    const expiresIn = new Date(session.expiresAt).getTime() - Date.now();
    if (expiresIn > 0) {
      expirationTimeout.current = setTimeout(() => {
        clearSession();
        toast.warning(t('impersonation.sessionExpired'));
        navigate('/admin', { replace: true });
      }, expiresIn);
    }

    return () => {
      if (validationInterval.current) clearInterval(validationInterval.current);
      if (expirationTimeout.current) clearTimeout(expirationTimeout.current);
    };
  }, [session, validateSession, navigate, t, clearSession]);

  // Start impersonation
  const startImpersonation = useCallback(async (targetTenantId: string, reason?: string): Promise<boolean> => {
    if (!isGlobalSuperadmin) {
      console.error('[IMPERSONATION] Cannot start: not a superadmin');
      return false;
    }

    try {
      const { data, error } = await supabase.functions.invoke('start-impersonation', {
        body: { targetTenantId, reason },
      });

      if (error) {
        console.error('[IMPERSONATION] Start failed:', error);
        toast.error(t('impersonation.startFailed'));
        return false;
      }

      if (data.error) {
        console.error('[IMPERSONATION] Start failed:', data.error);
        toast.error(data.error);
        return false;
      }

      const newSession: ImpersonationSession = {
        impersonationId: data.impersonationId,
        targetTenantId: data.targetTenantId,
        targetTenantSlug: data.targetTenantSlug,
        targetTenantName: data.targetTenantName,
        expiresAt: data.expiresAt,
        status: 'ACTIVE',
      };

      setSession(newSession);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));

      toast.success(`${t('impersonation.started')}: ${data.targetTenantName}`);
      return true;
    } catch (err) {
      console.error('[IMPERSONATION] Start error:', err);
      toast.error(t('impersonation.startFailed'));
      return false;
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
        console.error('[IMPERSONATION] End failed:', error);
      }
    } catch (err) {
      console.error('[IMPERSONATION] End error:', err);
    } finally {
      clearSession();
      navigate('/admin', { replace: true });
      toast.info(t('impersonation.ended'));
    }
  }, [session, clearSession, navigate, t]);

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
    startImpersonation,
    endImpersonation,
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
