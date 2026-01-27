/**
 * 🔐 TenantOnboardingGate — Block access until onboarding is complete
 * 
 * If tenant.onboarding_completed is false, redirects to /app/onboarding
 * except for allowed routes (academies, coaches, grading-schemes, onboarding itself).
 */
import React, { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';

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
  const { tenant, isLoading } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isLoading || !tenant) return;

    // Check if onboarding is complete
    // Type assertion needed since we just added these columns
    const isComplete = (tenant as unknown as { onboarding_completed?: boolean }).onboarding_completed;
    
    if (isComplete) return; // Onboarding done, allow access

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
  }, [tenant, isLoading, location.pathname, navigate]);

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
 */
export function useOnboardingStatus() {
  const { tenant, isLoading } = useTenant();
  
  const isComplete = tenant 
    ? (tenant as unknown as { onboarding_completed?: boolean }).onboarding_completed ?? false
    : false;

  return {
    isComplete,
    isLoading,
    tenant,
  };
}
