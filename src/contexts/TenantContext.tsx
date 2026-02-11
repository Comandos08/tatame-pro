import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Tenant, TenantContext as TenantContextType } from '@/types/tenant';

interface ExtendedTenantContext extends TenantContextType {
  billingInfo: TenantBillingInfo | null;
  refetchTenant: () => void;
}

interface TenantBillingInfo {
  status: string;
  stripe_customer_id: string | null;
  scheduled_delete_at: string | null;
}

const TenantContext = createContext<ExtendedTenantContext | undefined>(undefined);

interface TenantProviderProps {
  children: ReactNode;
}

export function TenantProvider({ children }: TenantProviderProps) {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [billingInfo, setBillingInfo] = useState<TenantBillingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // ✅ UX/02 — Refetch trigger for forcing context reload
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  
  // 🔐 HARDENING: Track mount state to prevent setState after unmount
  const isMountedRef = useRef(true);
  
  // ✅ P-IMP-01 — Guard to prevent concurrent fetches
  const isFetchingRef = useRef(false);
  
  // ✅ UX/02 — Expose refetch function
  const refetchTenant = useCallback(() => {
    setRefetchTrigger(prev => prev + 1);
  }, []);

  // ✅ P-IMP-FIX — Separate mount/unmount tracking from fetch effect
  // This ensures isMountedRef only changes on TRUE mount/unmount, not effect re-runs
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []); // Empty deps = only mount/unmount

  // ✅ P-IMP-FIX — Fetch effect (separate from mount tracking)
  useEffect(() => {
    // 🔐 HARDENING: AbortController for cancellable fetch
    const abortController = new AbortController();

    async function fetchTenant() {
      // ✅ P-IMP-01 — Prevent concurrent fetches
      if (isFetchingRef.current) {
        logger.debug('[TENANT] Fetch already in progress, skipping');
        return;
      }
      
      if (!tenantSlug) {
        if (isMountedRef.current) {
          setTenant(null);
          setBillingInfo(null);
          setIsLoading(false);
        }
        return;
      }

      isFetchingRef.current = true;
      logger.debug('[TENANT] Fetch started for slug:', tenantSlug);

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        // First try to find an active tenant
        let { data, error: fetchError } = await supabase
          .from('tenants')
          .select('*')
          .eq('slug', tenantSlug)
          .eq('is_active', true)
          .single();

        // 🔐 Check abort before continuing
        if (abortController.signal.aborted) return;

        // If not found as active, check if tenant exists but is inactive
        if (fetchError?.code === 'PGRST116') {
          const { data: inactiveTenant, error: inactiveError } = await supabase
            .from('tenants')
            .select('*')
            .eq('slug', tenantSlug)
            .eq('is_active', false)
            .single();

          if (abortController.signal.aborted) return;

          if (!inactiveError && inactiveTenant) {
            data = inactiveTenant;
            fetchError = null;
          }
        }

        if (!isMountedRef.current) return;

        if (fetchError) {
          if (fetchError.code === 'PGRST116') {
            setError(new Error('Organização não encontrada'));
          } else {
            throw fetchError;
          }
          setTenant(null);
          setBillingInfo(null);
        } else if (data) {
          const tenantData: Tenant = {
            id: data.id,
            slug: data.slug,
            name: data.name,
            description: data.description,
            logoUrl: data.logo_url,
            primaryColor: data.primary_color || '#dc2626',
            sportTypes: (data.sport_types || []) as Tenant['sportTypes'],
            stripeCustomerId: data.stripe_customer_id,
            isActive: data.is_active ?? true,
            createdAt: data.created_at ?? '',
            updatedAt: data.updated_at ?? '',
            // P3.1 — Load all lifecycle fields
            onboardingCompleted: data.onboarding_completed ?? undefined,
            status: (data.status as Tenant['status']) ?? undefined,
            creationSource: (data.creation_source as Tenant['creationSource']) ?? undefined,
          };
          setTenant(tenantData);

          // Fetch billing info if tenant is inactive
          if (!data.is_active) {
            if (abortController.signal.aborted) return;
            
            const { data: billing } = await supabase
              .from('tenant_billing')
              .select('status, stripe_customer_id, scheduled_delete_at')
              .eq('tenant_id', data.id)
              .maybeSingle();
            
            if (!abortController.signal.aborted && isMountedRef.current) {
              setBillingInfo(billing);
            }
          } else {
            setBillingInfo(null);
          }
        }
      } catch (err) {
        if (abortController.signal.aborted || !isMountedRef.current) return;
        
        logger.error('[TENANT] Fetch error:', err);
        setError(err instanceof Error ? err : new Error('Erro ao carregar organização'));
        setTenant(null);
        setBillingInfo(null);
      } finally {
        // ✅ P-IMP-01 — Always release fetch lock
        isFetchingRef.current = false;
        if (!abortController.signal.aborted && isMountedRef.current) {
          setIsLoading(false);
          logger.debug('[TENANT] Fetch completed');
        }
      }
    }

    fetchTenant();
    
    // 🔐 Cleanup — Only abort request, DO NOT touch isMountedRef
    // isMountedRef is managed by the separate mount/unmount effect above
    return () => {
      abortController.abort();
    };
  }, [tenantSlug, refetchTrigger]); // ✅ UX/02 — Add refetchTrigger dependency

  return (
    <TenantContext.Provider value={{ tenant, isLoading, error, billingInfo, refetchTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
