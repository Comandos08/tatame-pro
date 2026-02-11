/**
 * 🔐 TenantOnboardingGate — Block access until tenant is ACTIVE
 * 
 * PI B2 — Now consumes TenantFlagsContract as source of truth
 * 
 * Rule: If tenant.status === 'SETUP', redirect to /app/onboarding
 * Fail-closed: if contract not loaded, show loader (never allow through)
 */
import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useTenantFlagsContract } from '@/hooks/useTenantFlagsContract';
import { logger } from '@/lib/logger';

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
  const { tenant, isLoading: isTenantLoading } = useTenant();
  const { isImpersonating, resolutionStatus } = useImpersonation();
  const { contract: _contract, isLoading: isContractLoading } = useTenantFlagsContract(tenant?.id);
  const navigate = useNavigate();
  const location = useLocation();

  // P3.1 — Simple status-based redirect using contract
  useEffect(() => {
    // Don't run during impersonation resolution
    if (isImpersonating && resolutionStatus !== 'RESOLVED') return;
    
    if (isTenantLoading || isContractLoading || !tenant) return;

    // B2: Use tenant.status (already loaded) — contract validates billing separately
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
      logger.log('[ONBOARDING-GATE] Tenant in SETUP mode, redirecting to onboarding');
      navigate(`/${tenant.slug}/app/onboarding`, { replace: true });
    }
  }, [tenant, isTenantLoading, isContractLoading, location.pathname, navigate, isImpersonating, resolutionStatus]);

  // Block rendering during impersonation resolution
  if (isImpersonating && resolutionStatus !== 'RESOLVED') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // B2 fail-closed: block while tenant OR contract loads
  if (isTenantLoading || isContractLoading) {
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
 * B2 — Uses contract as canonical source
 */
export function useOnboardingStatus() {
  const { tenant, isLoading: isTenantLoading, refetchTenant } = useTenant();
  const { contract, isLoading: isContractLoading, refetch: refetchContract } = useTenantFlagsContract(tenant?.id);
  
  // B2: Use contract for onboarding_completed, tenant.status for SETUP check
  const isComplete = contract?.onboarding_completed === true || tenant?.status === 'ACTIVE';
  const isSetupMode = tenant?.status === 'SETUP';
  const isLoading = isTenantLoading || isContractLoading;

  return {
    isComplete,
    isSetupMode,
    isLoading,
    tenant,
    refetchTenant: () => {
      refetchTenant();
      refetchContract();
    },
  };
}
