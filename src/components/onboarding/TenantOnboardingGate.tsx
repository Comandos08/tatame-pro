/**
 * 🔐 TenantOnboardingGate — Block access until onboarding is complete
 * 
 * If tenant.onboarding_completed is false, redirects to /app/onboarding
 * except for allowed routes (academies, coaches, grading-schemes, onboarding itself).
 * 
 * ✅ P-IMP-01 — Fixed infinite loop on impersonation with single-refetch guard
 */
import React, { ReactNode, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';

interface TenantOnboardingGateProps {
  children: ReactNode;
}

// Routes that are allowed during onboarding
const ALLOWED_ROUTES = [
  '/app/onboarding',
  '/app/academies',
  '/app/coaches',
  '/app/grading-schemes',
  '/app/settings',
];

export function TenantOnboardingGate({ children }: TenantOnboardingGateProps) {
  const { tenant, isLoading, refetchTenant } = useTenant();
  const { isImpersonating } = useImpersonation();
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ P-IMP-01 — Single-refetch guard per impersonation session
  const hasRefetchedForImpersonationRef = useRef(false);

  // ✅ P-IMP-01 — Refetch tenant data ONCE when impersonation starts
  useEffect(() => {
    // Reset guard when impersonation ends
    if (!isImpersonating) {
      hasRefetchedForImpersonationRef.current = false;
      return;
    }

    // Already refetched for this session? Skip
    if (hasRefetchedForImpersonationRef.current) {
      return;
    }

    // Wait for initial loading to complete
    if (isLoading) {
      return;
    }

    // Execute ONCE
    hasRefetchedForImpersonationRef.current = true;
    console.log('[ONBOARDING-GATE] Refetching tenant for impersonation (once)');
    refetchTenant();
  }, [isImpersonating, isLoading, refetchTenant]);

  useEffect(() => {
    if (isLoading || !tenant) return;

    // Check if onboarding is complete via flag
    const isComplete = tenant?.onboardingCompleted === true;
    
    if (isComplete) return; // Onboarding done, allow access

    // ✅ UX/02 — DEFENSIVE: Check if tenant has actual configured data
    // (handles case where flag is false but tenant already has data)
    // This prevents loops when DB flag wasn't properly updated
    const hasRealConfiguration = Boolean(
      tenant?.isActive &&
      tenant?.sportTypes?.length > 0
    );
    
    // If impersonating and tenant has real data, skip onboarding redirect
    if (isImpersonating && hasRealConfiguration) {
      console.log('[ONBOARDING-GATE] Skipping for impersonation with configured tenant');
      return;
    }

    // Check if current route is allowed during onboarding
    const currentPath = location.pathname;
    const tenantPrefix = `/${tenant.slug}`;
    const relativePath = currentPath.replace(tenantPrefix, '');
    
    const isAllowed = ALLOWED_ROUTES.some(route => 
      relativePath === route || relativePath.startsWith(route + '/')
    );

    if (!isAllowed) {
      // Redirect to onboarding wizard
      navigate(`/${tenant.slug}/app/onboarding`, { replace: true });
    }
  }, [tenant, isLoading, location.pathname, navigate, isImpersonating]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Hook to check if tenant onboarding is complete.
 * Use this for conditional UI rendering.
 * 
 * ✅ UX/02 — Enhanced with defensive real-configuration check
 */
export function useOnboardingStatus() {
  const { tenant, isLoading, refetchTenant } = useTenant();
  
  // Check both flag AND real tenant configuration
  const isComplete = tenant?.onboardingCompleted === true;
  
  // Defensive: also consider tenant "complete" if it has real data
  const hasRealConfiguration = Boolean(
    tenant?.isActive &&
    tenant?.sportTypes?.length > 0
  );

  return {
    isComplete: isComplete || hasRealConfiguration,
    isLoading,
    tenant,
    refetchTenant,
  };
}
