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
import { useTenantFlags } from '@/contexts/TenantFlagsContext';
import { logger } from '@/lib/logger';

interface TenantOnboardingGateProps {
  children: ReactNode;
}

/**
 * Routes accessible during tenant onboarding (SETUP status or onboarding_completed=false).
 * All other /app/* routes redirect to /app/onboarding until the tenant is fully activated.
 *
 * P2-FIX: Exported so callers (sidebar nav, breadcrumbs, tests) can reference the
 * same source of truth. When adding a new route that must be reachable during setup,
 * add it here — prefix matching is used, so '/app/grading-schemes' also covers
 * '/app/grading-schemes/:id/levels'.
 */
export const ONBOARDING_ALLOWED_ROUTES = [
  '/app/onboarding',
  '/app/academies',
  '/app/coaches',
  '/app/grading-schemes',
  '/app/settings',
] as const;

export function TenantOnboardingGate({ children }: TenantOnboardingGateProps) {
  const { tenant, isLoading: isTenantLoading } = useTenant();
  const { isImpersonating, resolutionStatus } = useImpersonation();
  const { contract: _contract, isLoading: isContractLoading, isError: isContractError } = useTenantFlags();
  const navigate = useNavigate();
  const location = useLocation();

  // P3.1 — Simple status-based redirect using contract
  useEffect(() => {
    // Don't run during impersonation resolution
    if (isImpersonating && resolutionStatus !== 'RESOLVED') return;
    
    // P0-FIX: also guard on contract error — when contract errored, _contract is null
    // but isContractError is true; we must not proceed with stale/absent data.
    if (isTenantLoading || isContractLoading || isContractError || !tenant) return;

    // P0-02: Check BOTH tenant.status === 'SETUP' AND onboarding_completed === false
    // Tenants created via wizard arrive as ACTIVE with onboarding_completed: false
    // The contract (TenantFlagsContract) is the source of truth for onboarding_completed.
    // P0-FIX: Fail-closed fallback — if contract is null (invalid RPC payload or disabled
    // query), treat onboarding as incomplete. An active+complete tenant will never have
    // a null contract under normal operation; assuming incomplete is the safe choice.
    const isSetupMode = tenant.status === 'SETUP';
    const isOnboardingIncomplete = _contract !== null
      ? _contract.onboarding_completed !== true
      : true; // fail-closed: unknown contract state = assume incomplete
    
    // Only enforce onboarding gate if tenant is in SETUP or onboarding is explicitly incomplete
    if (!isSetupMode && !isOnboardingIncomplete) return;

    // Check if current route is allowed during onboarding
    const currentPath = location.pathname;
    const tenantPrefix = `/${tenant.slug}`;
    const relativePath = currentPath.replace(tenantPrefix, '');
    
    const isAllowed = ONBOARDING_ALLOWED_ROUTES.some(route =>
      relativePath === route || relativePath.startsWith(route + '/')
    );

    if (!isAllowed) {
      logger.log('[ONBOARDING-GATE] Tenant onboarding incomplete, redirecting to onboarding', {
        status: tenant.status,
        onboarding_completed: _contract?.onboarding_completed,
      });
      navigate(`/${tenant.slug}/app/onboarding`, { replace: true });
    }
  }, [tenant, isTenantLoading, isContractLoading, isContractError, _contract, location.pathname, navigate, isImpersonating, resolutionStatus]);

  // Block rendering during impersonation resolution
  if (isImpersonating && resolutionStatus !== 'RESOLVED') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // B2 fail-closed: block while tenant OR contract loads (or errors)
  if (isTenantLoading || isContractLoading || isContractError) {
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
  const { contract, isLoading: isContractLoading, refetch: refetchContract } = useTenantFlags();
  
  // B2: Use contract for onboarding_completed, tenant.status for SETUP check
  // P0-02: onboarding_completed from contract is the source of truth
  // tenant.status === 'ACTIVE' alone does NOT mean onboarding is complete
  const isComplete = contract?.onboarding_completed === true;
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
