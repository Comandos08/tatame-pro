/**
 * 🔐 IDENTITY CONTEXT — Wizard State Machine
 * 
 * Manages the mandatory identity wizard state.
 * Ensures no user can access protected routes without resolved tenant.
 * 
 * RULES:
 * - wizard_completed = false → BLOCKING state
 * - wizard_completed = true → tenant resolved, access granted
 * - Superadmins bypass wizard (no tenant required)
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
  code: 'TENANT_NOT_FOUND' | 'INVITE_INVALID' | 'PERMISSION_DENIED' | 'IMPERSONATION_INVALID' | 'UNKNOWN';
  message: string;
}

interface IdentityContextType {
  identityState: IdentityState;
  error: IdentityError | null;
  wizardCompleted: boolean;
  tenantId: string | null;
  tenantSlug: string | null;
  refreshIdentity: () => Promise<void>;
  completeWizard: (tenantId: string, tenantSlug: string) => Promise<void>;
  setIdentityError: (error: IdentityError) => void;
  clearError: () => void;
}

const IdentityContext = createContext<IdentityContextType | undefined>(undefined);

interface IdentityProviderProps {
  children: ReactNode;
}

export function IdentityProvider({ children }: IdentityProviderProps) {
  const { currentUser, isAuthenticated, isLoading: authLoading, isGlobalSuperadmin } = useCurrentUser();
  
  const [identityState, setIdentityState] = useState<IdentityState>('loading');
  const [error, setError] = useState<IdentityError | null>(null);
  const [wizardCompleted, setWizardCompleted] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserIdRef = useRef<string | null>(null);

  const checkIdentity = useCallback(async (signal: AbortSignal) => {
    if (!currentUser?.id) {
      if (isMountedRef.current) {
        setIdentityState('loading');
        setWizardCompleted(false);
        setTenantId(null);
        setTenantSlug(null);
      }
      return;
    }

    try {
      // 1️⃣ Check if superadmin (bypasses wizard)
      if (isGlobalSuperadmin) {
        if (!signal.aborted && isMountedRef.current) {
          setIdentityState('superadmin');
          setWizardCompleted(true);
        }
        return;
      }

      // 2️⃣ Check profile for wizard_completed flag
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('wizard_completed, tenant_id')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (signal.aborted) return;

      if (profileError) {
        console.error('[IdentityContext] Failed to fetch profile', profileError);
        if (isMountedRef.current) {
          setIdentityState('error');
          setError({ code: 'UNKNOWN', message: 'Failed to verify identity' });
        }
        return;
      }

      const isWizardCompleted = profile?.wizard_completed ?? false;

      if (!isWizardCompleted) {
        // Wizard not completed - check if user actually has tenant context
        // (retroactive check for users created before wizard)
        const hasContext = await checkTenantContext(currentUser.id, signal);
        
        if (signal.aborted) return;

        if (hasContext.hasTenant) {
          // User has tenant context but wizard not marked - auto-complete
          await supabase
            .from('profiles')
            .update({ wizard_completed: true })
            .eq('id', currentUser.id);

          if (!signal.aborted && isMountedRef.current) {
            setWizardCompleted(true);
            setTenantId(hasContext.tenantId);
            setTenantSlug(hasContext.tenantSlug);
            setIdentityState('resolved');
          }
          return;
        }

        // No tenant context - wizard required
        if (isMountedRef.current) {
          setWizardCompleted(false);
          setIdentityState('wizard_required');
        }
        return;
      }

      // 3️⃣ Wizard completed - resolve tenant context
      const context = await checkTenantContext(currentUser.id, signal);
      
      if (signal.aborted) return;

      if (!context.hasTenant) {
        // Edge case: wizard marked complete but no tenant
        // Reset wizard_completed and force wizard
        await supabase
          .from('profiles')
          .update({ wizard_completed: false })
          .eq('id', currentUser.id);

        if (isMountedRef.current) {
          setWizardCompleted(false);
          setIdentityState('wizard_required');
        }
        return;
      }

      if (isMountedRef.current) {
        setWizardCompleted(true);
        setTenantId(context.tenantId);
        setTenantSlug(context.tenantSlug);
        setIdentityState('resolved');
      }
    } catch (err) {
      if (signal.aborted) return;
      console.error('[IdentityContext] Unexpected error', err);
      if (isMountedRef.current) {
        setIdentityState('error');
        setError({ code: 'UNKNOWN', message: 'Unexpected error during identity check' });
      }
    }
  }, [currentUser?.id, isGlobalSuperadmin]);

  const checkTenantContext = async (
    userId: string, 
    signal: AbortSignal
  ): Promise<{ hasTenant: boolean; tenantId: string | null; tenantSlug: string | null }> => {
    // Check profile tenant_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id, tenants!inner(slug)')
      .eq('id', userId)
      .maybeSingle();

    if (signal.aborted) return { hasTenant: false, tenantId: null, tenantSlug: null };

    if (profile?.tenant_id) {
      const slug = (profile as any).tenants?.slug;
      return { hasTenant: true, tenantId: profile.tenant_id, tenantSlug: slug };
    }

    // Check athlete link
    const { data: athlete } = await supabase
      .from('athletes')
      .select('tenant_id, tenants!inner(slug)')
      .eq('profile_id', userId)
      .maybeSingle();

    if (signal.aborted) return { hasTenant: false, tenantId: null, tenantSlug: null };

    if (athlete?.tenant_id) {
      const slug = (athlete as any).tenants?.slug;
      return { hasTenant: true, tenantId: athlete.tenant_id, tenantSlug: slug };
    }

    // Check tenant roles
    const { data: role } = await supabase
      .from('user_roles')
      .select('tenant_id, tenants!inner(slug)')
      .eq('user_id', userId)
      .not('tenant_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (signal.aborted) return { hasTenant: false, tenantId: null, tenantSlug: null };

    if (role?.tenant_id) {
      const slug = (role as any).tenants?.slug;
      return { hasTenant: true, tenantId: role.tenant_id, tenantSlug: slug };
    }

    return { hasTenant: false, tenantId: null, tenantSlug: null };
  };

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
      setTenantId(null);
      setTenantSlug(null);
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
  }, [authLoading, isAuthenticated, currentUser, isGlobalSuperadmin, checkIdentity]);

  const refreshIdentity = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    await checkIdentity(abortControllerRef.current.signal);
  };

  const completeWizard = async (newTenantId: string, newTenantSlug: string) => {
    if (!currentUser?.id) return;

    try {
      // Update profile with wizard_completed and tenant_id
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          wizard_completed: true,
          tenant_id: newTenantId 
        })
        .eq('id', currentUser.id);

      if (updateError) {
        throw updateError;
      }

      setWizardCompleted(true);
      setTenantId(newTenantId);
      setTenantSlug(newTenantSlug);
      setIdentityState('resolved');
    } catch (err) {
      console.error('[IdentityContext] Failed to complete wizard', err);
      setError({ code: 'UNKNOWN', message: 'Failed to complete wizard' });
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
        tenantId,
        tenantSlug,
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
