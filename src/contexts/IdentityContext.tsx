/**
 * 🔐 IDENTITY CONTEXT — Consume-Only State Machine
 * 
 * F0.2.3 CONTRACT-COMPLIANT:
 * - ALWAYS calls Edge Function when authenticated
 * - NEVER leaves identityState='loading' indefinitely
 * - Treats errors explicitly
 * - Has defensive timeout
 * 
 * RULES:
 * - All identity resolution happens via Edge Function
 * - No direct queries to profiles/roles/athletes for identity
 * - Stores only: identityState, tenant, role
 * - Superadmins bypass wizard (checked by backend)
 */
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';

export type IdentityState = 
  | 'loading'           // Checking identity status
  | 'wizard_required'   // Must complete wizard
  | 'resolved'          // Tenant resolved, access granted
  | 'superadmin'        // Global superadmin, no tenant required
  | 'error';            // Error state

export interface IdentityError {
  code: 'TENANT_NOT_FOUND' | 'INVITE_INVALID' | 'PERMISSION_DENIED' | 'IMPERSONATION_INVALID' | 'SLUG_TAKEN' | 'VALIDATION_ERROR' | 'UNKNOWN';
  message: string;
}

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
}

interface IdentityContextType {
  identityState: IdentityState;
  error: IdentityError | null;
  wizardCompleted: boolean;
  tenantId: string | null;
  tenantSlug: string | null;
  tenant: TenantInfo | null;
  role: 'ADMIN_TENANT' | 'ATHLETE' | 'SUPERADMIN_GLOBAL' | null;
  redirectPath: string | null;
  refreshIdentity: () => Promise<void>;
  completeWizard: (payload: CompleteWizardPayload) => Promise<CompleteWizardResult>;
  setIdentityError: (error: IdentityError) => void;
  clearError: () => void;
}

export interface CompleteWizardPayload {
  joinMode: 'existing' | 'new';
  inviteCode?: string;
  newOrgName?: string;
  profileType: 'admin' | 'athlete';
}

export interface CompleteWizardResult {
  success: boolean;
  tenant?: TenantInfo;
  role?: 'ADMIN_TENANT' | 'ATHLETE';
  redirectPath?: string;
  error?: IdentityError;
}

const IdentityContext = createContext<IdentityContextType | undefined>(undefined);

interface IdentityProviderProps {
  children: ReactNode;
}

export function IdentityProvider({ children }: IdentityProviderProps) {
  const { currentUser, isAuthenticated, isLoading: authLoading } = useCurrentUser();
  
  const [identityState, setIdentityState] = useState<IdentityState>('loading');
  const [error, setError] = useState<IdentityError | null>(null);
  const [wizardCompleted, setWizardCompleted] = useState(false);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [role, setRole] = useState<'ADMIN_TENANT' | 'ATHLETE' | 'SUPERADMIN_GLOBAL' | null>(null);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);
  
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isCheckingRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Call Edge Function to check identity
   * This is the ONLY source of truth for identity resolution
   */
  const checkIdentity = useCallback(async () => {
    // Prevent concurrent checks
    if (isCheckingRef.current) {
      console.log('[IdentityContext] Check already in progress, skipping');
      return;
    }

    isCheckingRef.current = true;
    setIdentityState('loading');
    setError(null);

    // Defensive timeout - NEVER stay in loading forever
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && isCheckingRef.current) {
        console.error('[IdentityContext] Timeout - forcing error state');
        setIdentityState('error');
        setError({ code: 'UNKNOWN', message: 'Identity check timed out' });
        isCheckingRef.current = false;
      }
    }, 10000);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        console.warn('[IdentityContext] No access token available');
        if (isMountedRef.current) {
          // No token = treat as unauthenticated, use 'resolved' so gate redirects to /login
          setIdentityState('resolved');
        }
        return;
      }

      // Create abort controller for this request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-identity-wizard`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action: 'CHECK' }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!isMountedRef.current) return;

      if (!response.ok) {
        throw new Error(`Identity check failed with status ${response.status}`);
      }

      const result = await response.json();

      if (!isMountedRef.current) return;

      console.log('[IdentityContext] CHECK result:', result.status);

      switch (result.status) {
        case 'RESOLVED':
          setWizardCompleted(true);
          setTenant(result.tenant || null);
          setRole(result.role || null);
          setRedirectPath(result.redirectPath || null);
          
          if (result.role === 'SUPERADMIN_GLOBAL') {
            setIdentityState('superadmin');
          } else {
            setIdentityState('resolved');
          }
          break;

        case 'WIZARD_REQUIRED':
          setWizardCompleted(false);
          setTenant(null);
          setRole(null);
          setRedirectPath(null);
          setIdentityState('wizard_required');
          break;

        case 'ERROR':
          setError(result.error || { code: 'UNKNOWN', message: 'Identity verification failed' });
          setIdentityState('error');
          break;

        default:
          console.error('[IdentityContext] Unknown status:', result.status);
          setError({ code: 'UNKNOWN', message: `Unknown identity status: ${result.status}` });
          setIdentityState('error');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[IdentityContext] Request aborted');
        return;
      }
      console.error('[IdentityContext] Check identity error:', err);
      if (isMountedRef.current) {
        setError({ code: 'UNKNOWN', message: err.message || 'Failed to connect to identity service' });
        setIdentityState('error');
      }
    } finally {
      isCheckingRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, []);

  // Main effect to check identity - SINGLE ENTRY POINT
  useEffect(() => {
    isMountedRef.current = true;

    // Wait for auth to finish loading
    if (authLoading) {
      setIdentityState('loading');
      return;
    }

    // Not authenticated - set resolved state so gate can redirect to /login
    if (!isAuthenticated || !currentUser) {
      console.log('[IdentityContext] Not authenticated, setting resolved state');
      setIdentityState('resolved');
      setWizardCompleted(false);
      setTenant(null);
      setRole(null);
      setRedirectPath(null);
      setError(null);
      return;
    }

    // Authenticated - CHECK identity
    console.log('[IdentityContext] User authenticated, checking identity...');
    checkIdentity();

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [authLoading, isAuthenticated, currentUser?.id, checkIdentity]);

  const refreshIdentity = async () => {
    if (!isAuthenticated) {
      setIdentityState('resolved');
      return;
    }
    await checkIdentity();
  };

  /**
   * Complete wizard via Edge Function
   * All sensitive writes happen on backend
   */
  const completeWizard = async (payload: CompleteWizardPayload): Promise<CompleteWizardResult> => {
    if (!currentUser?.id) {
      return { success: false, error: { code: 'PERMISSION_DENIED', message: 'Not authenticated' } };
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        return { success: false, error: { code: 'PERMISSION_DENIED', message: 'No session' } };
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-identity-wizard`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            action: 'COMPLETE_WIZARD',
            payload,
          }),
        }
      );

      const result = await response.json();

      if (result.status === 'RESOLVED') {
        setWizardCompleted(true);
        setTenant(result.tenant || null);
        setRole(result.role || null);
        setRedirectPath(result.redirectPath || null);
        setIdentityState('resolved');

        return {
          success: true,
          tenant: result.tenant,
          role: result.role,
          redirectPath: result.redirectPath,
        };
      } else if (result.status === 'ERROR') {
        return {
          success: false,
          error: result.error || { code: 'UNKNOWN', message: 'Failed to complete wizard' },
        };
      }

      return { success: false, error: { code: 'UNKNOWN', message: 'Unexpected response' } };
    } catch (err) {
      console.error('[IdentityContext] Complete wizard error:', err);
      return { success: false, error: { code: 'UNKNOWN', message: 'Failed to complete wizard' } };
    }
  };

  const setIdentityError = (newError: IdentityError) => {
    setError(newError);
    setIdentityState('error');
  };

  const clearError = () => {
    setError(null);
    if (isAuthenticated) {
      checkIdentity();
    } else {
      setIdentityState('resolved');
    }
  };

  return (
    <IdentityContext.Provider
      value={{
        identityState,
        error,
        wizardCompleted,
        tenantId: tenant?.id || null,
        tenantSlug: tenant?.slug || null,
        tenant,
        role,
        redirectPath,
        refreshIdentity,
        completeWizard,
        setIdentityError,
        clearError,
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const context = useContext(IdentityContext);
  if (context === undefined) {
    throw new Error('useIdentity must be used within an IdentityProvider');
  }
  return context;
}
