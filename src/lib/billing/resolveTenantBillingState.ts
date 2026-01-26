/**
 * CORE BILLING RESOLVER
 * Fonte de verdade única para estado de billing do tenant
 * 
 * REGRAS IMUTÁVEIS:
 * 1. Se is_manual_override = true → Stripe é COMPLETAMENTE ignorado
 * 2. canUseStripe = !isManualOverride
 * 3. Fallback é SEMPRE restritivo (isReadOnly: true, isBlocked: true)
 */

export type BillingStatus =
  | 'ACTIVE'
  | 'TRIALING'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'UNPAID'
  | 'INCOMPLETE';

export type BillingSource = 'STRIPE' | 'MANUAL_OVERRIDE';

export interface TenantBillingState {
  status: BillingStatus;
  isManualOverride: boolean;
  isActive: boolean;
  isReadOnly: boolean;
  isBlocked: boolean;
  canUseStripe: boolean;
  source: BillingSource;
  overrideReason: string | null;
  overrideAt: Date | null;
}

// AJUSTE #3: Tipos Raw declarados explicitamente
interface RawBillingData {
  status: string | null;
  is_manual_override: boolean;
  override_reason?: string | null;
  override_at?: string | null;
}

interface RawTenantData {
  is_active: boolean;
}

const VALID_STATUSES: BillingStatus[] = [
  'ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE'
];

export function resolveTenantBillingState(
  billing: RawBillingData | null,
  tenant: RawTenantData | null
): TenantBillingState {
  // P1.1 FIX #2: Calcular isManualOverride ANTES do fallback
  const isManualOverride = billing?.is_manual_override === true;
  
  // Fallback quando dados ausentes - SEMPRE RESTRITIVO
  if (!billing || !tenant) {
    return {
      status: 'INCOMPLETE',
      isManualOverride,
      isActive: false,
      isReadOnly: true,           // AJUSTE #2: true, não false
      isBlocked: true,
      canUseStripe: !isManualOverride,
      source: isManualOverride ? 'MANUAL_OVERRIDE' : 'STRIPE',
      overrideReason: billing?.override_reason ?? null,
      overrideAt: billing?.override_at ? new Date(billing.override_at) : null,
    };
  }

  // AJUSTE #1: Normalizar status ANTES de qualquer uso
  const rawStatus = (billing.status || 'INCOMPLETE').toUpperCase() as BillingStatus;
  const status: BillingStatus = VALID_STATUSES.includes(rawStatus)
    ? rawStatus
    : 'INCOMPLETE';

  // Source e canUseStripe
  const source: BillingSource = isManualOverride ? 'MANUAL_OVERRIDE' : 'STRIPE';
  const canUseStripe = !isManualOverride;

  // P1.1 FIX #1: isActive respeita override manual
  const isActive = isManualOverride
    ? status === 'ACTIVE' || status === 'TRIALING'
    : tenant.is_active === true;

  // Flags derivadas
  const isBlocked = !isActive || status === 'CANCELED';
  const isReadOnly = ['PAST_DUE', 'UNPAID', 'INCOMPLETE'].includes(status);

  return {
    status,
    isManualOverride,
    isActive,
    isReadOnly,
    isBlocked,
    canUseStripe,
    source,
    overrideReason: billing.override_reason ?? null,
    overrideAt: billing.override_at ? new Date(billing.override_at) : null,
  };
}
