import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Tenant, TenantContext as TenantContextType } from '@/types/tenant';

const TenantContext = createContext<TenantContextType | undefined>(undefined);

interface TenantProviderProps {
  children: ReactNode;
}

export function TenantProvider({ children }: TenantProviderProps) {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchTenant() {
      if (!tenantSlug) {
        setTenant(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('tenants')
          .select('*')
          .eq('slug', tenantSlug)
          .eq('is_active', true)
          .single();

        if (fetchError) {
          if (fetchError.code === 'PGRST116') {
            setError(new Error('Organização não encontrada'));
          } else {
            throw fetchError;
          }
          setTenant(null);
        } else if (data) {
          setTenant({
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
          });
        }
      } catch (err) {
        console.error('Error fetching tenant:', err);
        setError(err instanceof Error ? err : new Error('Erro ao carregar organização'));
        setTenant(null);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTenant();
  }, [tenantSlug]);

  return (
    <TenantContext.Provider value={{ tenant, isLoading, error }}>
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
