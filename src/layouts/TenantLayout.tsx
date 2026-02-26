/**
 * ============================================================================
 * 🏢 TENANT LAYOUT — Tenant Context Boundary
 * ============================================================================
 * 
 * CONTRACT:
 * This layout is the SECOND gate in the access hierarchy.
 * It ensures that a valid tenant context exists before rendering tenant routes.
 * 
 * HIERARCHY:
 * IdentityGate (auth) → TenantLayout (tenant context) → RequireRoles (permissions)
 * 
 * RESPONSIBILITIES (what this gate DOES):
 * ✔️ Resolves tenant from URL slug
 * ✔️ Validates tenant exists and is active
 * ✔️ Blocks access if tenant is inactive (billing blocked)
 * ✔️ Injects tenant theming (primary color CSS variable)
 * ✔️ Wraps protected routes with TenantOnboardingGate
 * 
 * BOUNDARIES (what this gate DOES NOT do):
 * ❌ DOES NOT validate authentication — IdentityGate handles this
 * ❌ DOES NOT validate user roles — RequireRoles handles this
 * ❌ DOES NOT decide billing logic — resolveTenantBillingState handles this
 * ❌ DOES NOT manage impersonation — ImpersonationContext handles this
 * 
 * SECURITY MODEL:
 * - FAIL-CLOSED: Invalid tenant shows error UI, not silent pass
 * - FAIL-CLOSED: Inactive tenant blocks protected routes
 * - Public tenant routes (landing, events) are NOT blocked by billing
 * 
 * ASSUMES:
 * - User is already authenticated (IdentityGate ran first)
 * - URL contains valid tenant slug as first segment
 * ============================================================================
 */

import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { TenantProvider, useTenant } from '@/contexts/TenantContext';
import { TenantBlockedScreen } from '@/components/billing/TenantBlockedScreen';
import { TenantOnboardingGate } from '@/components/onboarding/TenantOnboardingGate';
import { TenantFlagsProvider } from '@/contexts/TenantFlagsContext';
import { useI18n } from '@/contexts/I18nContext';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Home, ShieldAlert } from 'lucide-react';
import { hexToHsl } from '@/lib/colorUtils';
import { BlockedStateCard } from '@/components/ux/BlockedStateCard';

// =============================================================================
// TENANT CONTENT COMPONENT
// =============================================================================

function TenantContent() {
  const { tenant, isLoading, error, billingInfo, boundaryViolation } = useTenant();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();

  // =========================================================================
  // STEP 1: Tenant Theming Injection
  // =========================================================================
  // BY DESIGN: Tenant branding is applied at the layout level
  // INTENTIONAL: CSS variables allow components to use tenant colors without prop drilling
  useEffect(() => {
    if (tenant?.primaryColor) {
      const hsl = hexToHsl(tenant.primaryColor);
      document.documentElement.style.setProperty('--tenant-primary', hsl);
      document.documentElement.style.setProperty('--tenant-primary-hex', tenant.primaryColor);
    }

    return () => {
      // INTENTIONAL: Cleanup on unmount to prevent color bleed between tenants
      document.documentElement.style.removeProperty('--tenant-primary');
      document.documentElement.style.removeProperty('--tenant-primary-hex');
    };
  }, [tenant?.primaryColor]);

  // =========================================================================
  // STEP 2: Loading State
  // =========================================================================
  // BY DESIGN: Show loading while tenant context is being resolved
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t('tenant.loading')}</p>
        </motion.div>
      </div>
    );
  }

  // =========================================================================
  // STEP 3: Tenant Not Found / Error
  // =========================================================================
  // FAIL-CLOSED: Invalid tenant slug shows error UI
  // P1.1: Uses BlockedStateCard for unified UX
  if (error || !tenant) {
    return (
      <BlockedStateCard
        icon={AlertCircle}
        iconVariant="destructive"
        titleKey="tenant.notFound"
        descriptionKey="tenant.notFoundDesc"
        actions={[
          {
            labelKey: 'common.goHome',
            onClick: () => navigate('/'),
            icon: Home,
          },
        ]}
      />
    );
  }

  // =========================================================================
  // STEP 3.5: Tenant Boundary Violation (A04)
  // =========================================================================
  // FAIL-CLOSED: User has no membership in this tenant
  // SUPERADMIN is excluded (IdentityGate handles impersonation scope)
  // =========================================================================
  // STEP 3.5: Route Classification (used by boundary + billing checks)
  // =========================================================================
  const isProtectedRoute = location.pathname.includes('/app') || location.pathname.includes('/portal');

  // =========================================================================
  // STEP 3.6: Tenant Boundary Violation (A04)
  // =========================================================================
  // FAIL-CLOSED: User has no membership in this tenant — ONLY for protected routes
  // SUPERADMIN is excluded (IdentityGate handles impersonation scope)
  // BY DESIGN: Public tenant routes (membership, landing, events) remain accessible
  if (boundaryViolation && isProtectedRoute) {
    return (
      <BlockedStateCard
        icon={ShieldAlert}
        iconVariant="destructive"
        titleKey="tenant.boundaryViolation"
        descriptionKey="tenant.boundaryViolationDesc"
        actions={[
          {
            labelKey: 'common.goHome',
            onClick: () => navigate('/'),
            icon: Home,
          },
        ]}
      />
    );
  }

  // =========================================================================
  // STEP 4: Billing Block Check (Protected Routes Only)
  // =========================================================================
  // SECURITY BOUNDARY: Inactive tenants OR expired trials cannot access /app/* routes
  // BY DESIGN: Public routes (landing, events, verification) are NOT blocked
  // TRIAL_15_DAYS: TRIALING tenants are blocked when trial_expires_at has passed
  if (isProtectedRoute) {
    const billingStatus = billingInfo?.status?.toUpperCase();
    const trialExpiresAt = billingInfo?.trial_expires_at ? new Date(billingInfo.trial_expires_at) : null;
    const isTrialExpired = billingStatus === 'TRIALING' && trialExpiresAt && trialExpiresAt < new Date();

    // Block if: tenant inactive, trial expired, or billing explicitly blocked
    const shouldBlock = !tenant.isActive || isTrialExpired || billingStatus === 'TRIAL_EXPIRED' || billingStatus === 'PENDING_DELETE';

    if (shouldBlock) {
      // Allow /billing route even when blocked (so admin can pay)
      const isBillingRoute = location.pathname.includes('/billing');
      if (!isBillingRoute) {
        return (
          <TenantBlockedScreen
            tenantName={tenant.name}
            tenantId={tenant.id}
            billingStatus={billingInfo?.status || undefined}
            scheduledDeleteAt={billingInfo?.scheduled_delete_at || undefined}
            hasStripeCustomer={!!billingInfo?.stripe_customer_id}
          />
        );
      }
    }
  }

  // =========================================================================
  // STEP 5: Protected Route Rendering
  // =========================================================================
  // BY DESIGN: Protected routes are wrapped with TenantOnboardingGate
  // INTENTIONAL: Ensures onboarding is complete before accessing tenant features
  return (
    <TenantFlagsProvider tenantId={tenant?.id}>
      {isProtectedRoute ? (
        <TenantOnboardingGate>
          <Outlet />
        </TenantOnboardingGate>
      ) : (
        <Outlet />
      )}
    </TenantFlagsProvider>
  );
}

// =============================================================================
// TENANT LAYOUT (EXPORTED)
// =============================================================================
// BY DESIGN: Wraps content with TenantProvider to establish context
// DOES NOT validate auth — assumes IdentityGate already ran

export function TenantLayout() {
  return (
    <TenantProvider>
      <TenantContent />
    </TenantProvider>
  );
}
