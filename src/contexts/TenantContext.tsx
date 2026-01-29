import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Tenant, TenantContext as TenantContextType } from '@/types/tenant';

interface ExtendedTenantContext extends TenantContextType {
  billingInfo: TenantBillingInfo | null;
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
  
  // 🔐 HARDENING: Track mount state to prevent setState after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    // 🔐 HARDENING: AbortController for cancellable fetch
    const abortController = new AbortController();

    async function fetchTenant() {
      if (!tenantSlug) {
        if (isMountedRef.current) {
          setTenant(null);
          setBillingInfo(null);
          setIsLoading(false);
        }
        return;
      }

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
            sportTypes: (data.sport_types || ['BJJ']) as Tenant['sportTypes'],
            stripeCustomerId: data.stripe_customer_id,
            isActive: data.is_active,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
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
        
        console.error('Error fetching tenant:', err);
        setError(err instanceof Error ? err : new Error('Erro ao carregar organização'));
        setTenant(null);
        setBillingInfo(null);
      } finally {
        if (!abortController.signal.aborted && isMountedRef.current) {
          setIsLoading(false);
        }
      }
    }

    fetchTenant();
    
    // 🔐 Cleanup
    return () => {
      isMountedRef.current = false;
      abortController.abort();
    };
  }, [tenantSlug]);

  return (
    <TenantContext.Provider value={{ tenant, isLoading, error, billingInfo }}>
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
