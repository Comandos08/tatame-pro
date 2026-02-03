import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { TenantProvider, useTenant } from '@/contexts/TenantContext';
import { TenantBlockedScreen } from '@/components/billing/TenantBlockedScreen';
import { TenantOnboardingGate } from '@/components/onboarding/TenantOnboardingGate';
import { useI18n } from '@/contexts/I18nContext';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2 } from 'lucide-react';
import { hexToHsl } from '@/lib/colorUtils';

function TenantContent() {
  const { tenant, isLoading, error, billingInfo } = useTenant();
  const location = useLocation();
  const { t } = useI18n();

  // Inject tenant primary color as CSS variable
  useEffect(() => {
    if (tenant?.primaryColor) {
      const hsl = hexToHsl(tenant.primaryColor);
      document.documentElement.style.setProperty('--tenant-primary', hsl);
      document.documentElement.style.setProperty('--tenant-primary-hex', tenant.primaryColor);
    }

    return () => {
      // Cleanup on unmount
      document.documentElement.style.removeProperty('--tenant-primary');
      document.documentElement.style.removeProperty('--tenant-primary-hex');
    };
  }, [tenant?.primaryColor]);

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

  if (error || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 p-8 text-center"
        >
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-display font-bold">{t('tenant.notFound')}</h1>
          <p className="text-muted-foreground max-w-md">
            {t('tenant.notFoundDesc')}
          </p>
        </motion.div>
      </div>
    );
  }

  // Check if tenant is inactive (blocked due to billing)
  // Only show blocked screen for protected routes (/app/*)
  const isProtectedRoute = location.pathname.includes('/app');
  if (!tenant.isActive && isProtectedRoute) {
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

  // Wrap protected routes with onboarding gate
  if (isProtectedRoute) {
    return (
      <TenantOnboardingGate>
        <Outlet />
      </TenantOnboardingGate>
    );
  }

  return <Outlet />;
}

export function TenantLayout() {
  return (
    <TenantProvider>
      <TenantContent />
    </TenantProvider>
  );
}
