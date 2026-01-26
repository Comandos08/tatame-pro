import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';
import { resolveAthleteRouteAccess } from '@/lib/resolveAthleteRouteAccess';

interface AthleteRouteGuardProps {
  children: ReactNode;
}

export function AthleteRouteGuard({ children }: AthleteRouteGuardProps) {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useCurrentUser();

  const [tenantExists, setTenantExists] = useState<boolean | null>(null);
  const [isCheckingTenant, setIsCheckingTenant] = useState(true);

  // Prevent redirect loops
  const hasRedirected = useRef(false);

  // Check tenant exists (minimal query)
  useEffect(() => {
    const checkTenant = async () => {
      if (!tenantSlug) {
        setTenantExists(false);
        setIsCheckingTenant(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('tenants')
          .select('id')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (error || !data) {
          setTenantExists(false);
        } else {
          setTenantExists(true);
        }
      } catch {
        setTenantExists(false);
      } finally {
        setIsCheckingTenant(false);
      }
    };

    checkTenant();
  }, [tenantSlug]);

  // Apply route decision
  useEffect(() => {
    if (authLoading || isCheckingTenant || tenantExists === null || hasRedirected.current) {
      return;
    }

    const decision = resolveAthleteRouteAccess({
      tenantSlug: tenantSlug || null,
      pathname,
      isAuthenticated,
      tenantExists,
    });

    if (!decision.allow && decision.redirectTo) {
      hasRedirected.current = true;
      navigate(decision.redirectTo, { replace: true });
    }
  }, [authLoading, isCheckingTenant, tenantSlug, pathname, isAuthenticated, tenantExists, navigate]);

  // Loading state
  if (authLoading || isCheckingTenant || tenantExists === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Final decision check before render
  const decision = resolveAthleteRouteAccess({
    tenantSlug: tenantSlug || null,
    pathname,
    isAuthenticated,
    tenantExists,
  });

  if (!decision.allow) {
    // Already navigating or about to navigate, show loading
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Redirecionando...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
