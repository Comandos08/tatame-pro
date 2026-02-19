/**
 * PI-ONB-ENDTOEND-HARDEN-001
 * Deterministic localStorage helpers for onboarding flow.
 * Single source of truth for onboarding_mode and onboarding_tenant_code.
 */

const ONBOARDING_MODE_KEY = 'onboarding_mode';
const ONBOARDING_TENANT_CODE_KEY = 'onboarding_tenant_code';
const ONBOARDING_CORRELATION_KEY = 'onboarding_correlation_id';

export type OnboardingMode = 'join' | 'create';

const SLUG_REGEX = /^[a-z0-9-]{3,64}$/;

export function isValidTenantSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

export function setOnboardingIntent(mode: OnboardingMode, tenantCode?: string): string {
  const correlationId = crypto.randomUUID();
  localStorage.setItem(ONBOARDING_MODE_KEY, mode);
  localStorage.setItem(ONBOARDING_CORRELATION_KEY, correlationId);
  if (tenantCode) {
    localStorage.setItem(ONBOARDING_TENANT_CODE_KEY, tenantCode);
  } else {
    localStorage.removeItem(ONBOARDING_TENANT_CODE_KEY);
  }
  return correlationId;
}

export function getOnboardingIntent(): {
  mode: OnboardingMode | null;
  tenantCode: string | null;
  correlationId: string | null;
} {
  const mode = localStorage.getItem(ONBOARDING_MODE_KEY) as OnboardingMode | null;
  const tenantCode = localStorage.getItem(ONBOARDING_TENANT_CODE_KEY);
  const correlationId = localStorage.getItem(ONBOARDING_CORRELATION_KEY);
  return { mode, tenantCode, correlationId };
}

export function clearOnboardingIntent(): void {
  localStorage.removeItem(ONBOARDING_MODE_KEY);
  localStorage.removeItem(ONBOARDING_TENANT_CODE_KEY);
  localStorage.removeItem(ONBOARDING_CORRELATION_KEY);
}
