/**
 * 🔐 TenantOnboardingGate — Block access until tenant is ACTIVE
 * 
 * P3.1 — SIMPLIFIED GATE CONTRACT
 * 
 * Rule: If tenant.status === 'SETUP', redirect to /app/onboarding
 * 
 * ❌ No heuristics
 * ❌ No sport_types checks
 * ❌ No hasRealConfiguration inference
 * ✅ Only obeys the tenant status
 */
import React, { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';

interface TenantOnboardingGateProps {
  children: ReactNode;
}

// Routes that are allowed during onboarding (SETUP status)
const ALLOWED_ROUTES = [
  '/app/onboarding',
  '/app/academies',
  '/app/coaches',
  '/app/grading-schemes',
  '/app/settings',
];

export function TenantOnboardingGate({ children }: TenantOnboardingGateProps) {
  const { tenant, isLoading } = useTenant();
  const { isImpersonating, resolutionStatus } = useImpersonation();
  const navigate = useNavigate();
  const location = useLocation();

  // P3.1 — Simple status-based redirect
  useEffect(() => {
    // Don't run during impersonation resolution
    if (isImpersonating && resolutionStatus !== 'RESOLVED') return;
    
    if (isLoading || !tenant) return;

    // P3.1 — ONLY check status, nothing else
    const isSetupMode = tenant.status === 'SETUP';
    
    if (!isSetupMode) return; // Tenant is ACTIVE or other, allow access

    // Check if current route is allowed during onboarding
    const currentPath = location.pathname;
    const tenantPrefix = `/${tenant.slug}`;
    const relativePath = currentPath.replace(tenantPrefix, '');
    
    const isAllowed = ALLOWED_ROUTES.some(route => 
      relativePath === route || relativePath.startsWith(route + '/')
    );

    if (!isAllowed) {
      // Redirect to onboarding wizard
      console.log('[ONBOARDING-GATE] Tenant in SETUP mode, redirecting to onboarding');
      navigate(`/${tenant.slug}/app/onboarding`, { replace: true });
    }
  }, [tenant, isLoading, location.pathname, navigate, isImpersonating, resolutionStatus]);

  // Block rendering during impersonation resolution
  if (isImpersonating && resolutionStatus !== 'RESOLVED') {
    console.log('[ONBOARDING-GATE] Waiting for impersonation resolution:', resolutionStatus);
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
 * P3.1 — Simplified: just checks status === 'ACTIVE'
 */
export function useOnboardingStatus() {
  const { tenant, isLoading, refetchTenant } = useTenant();
  
  // P3.1 — Simple: tenant is "complete" when status is ACTIVE
  const isComplete = tenant?.status === 'ACTIVE';
  const isSetupMode = tenant?.status === 'SETUP';

  return {
    isComplete,
    isSetupMode,
    isLoading,
    tenant,
    refetchTenant,
  };
}