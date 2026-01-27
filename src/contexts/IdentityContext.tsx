/**
 * 🔐 IDENTITY CONTEXT — Consume-Only State Machine
 * 
 * REFACTORED: This context ONLY consumes identity state from the backend.
 * It NEVER writes to user_roles, tenant_billing, or identity decisions.
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
  const lastUserIdRef = useRef<string | null>(null);

  /**
   * Call Edge Function to check identity
   * This is the ONLY source of truth for identity resolution
   */
  const checkIdentity = useCallback(async (signal: AbortSignal) => {
    if (!currentUser?.id) {
      if (isMountedRef.current) {
        setIdentityState('loading');
        setWizardCompleted(false);
        setTenant(null);
        setRole(null);
        setRedirectPath(null);
      }
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        if (isMountedRef.current) {
          setIdentityState('loading');
        }
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-identity-wizard`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action: 'CHECK' }),
          signal,
        }
      );

      if (signal.aborted) return;

      const result = await response.json();

      if (!isMountedRef.current) return;

      if (result.status === 'RESOLVED') {
        setWizardCompleted(true);
        setTenant(result.tenant || null);
        setRole(result.role || null);
        setRedirectPath(result.redirectPath || null);
        
        if (result.role === 'SUPERADMIN_GLOBAL') {
          setIdentityState('superadmin');
        } else {
          setIdentityState('resolved');
        }
      } else if (result.status === 'WIZARD_REQUIRED') {
        setWizardCompleted(false);
        setIdentityState('wizard_required');
      } else if (result.status === 'ERROR') {
        setError(result.error || { code: 'UNKNOWN', message: 'Failed to verify identity' });
        setIdentityState('error');
      }
    } catch (err) {
      if (signal.aborted) return;
      console.error('[IdentityContext] Check identity error:', err);
      if (isMountedRef.current) {
        setIdentityState('error');
        setError({ code: 'UNKNOWN', message: 'Failed to connect to identity service' });
      }
    }
  }, [currentUser?.id]);

  // Main effect to check identity
  useEffect(() => {
    isMountedRef.current = true;
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Wait for auth to finish loading
    if (authLoading) {
      setIdentityState('loading');
      return;
    }

    // Not authenticated - reset state
    if (!isAuthenticated || !currentUser) {
      setIdentityState('loading');
      setWizardCompleted(false);
      setTenant(null);
      setRole(null);
      setRedirectPath(null);
      setError(null);
      return;
    }

    // Check if user changed
    if (lastUserIdRef.current !== currentUser.id) {
      lastUserIdRef.current = currentUser.id;
    }

    checkIdentity(signal);

    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, [authLoading, isAuthenticated, currentUser, checkIdentity]);

  const refreshIdentity = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    await checkIdentity(abortControllerRef.current.signal);
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
    setIdentityState('loading');
    refreshIdentity();
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
