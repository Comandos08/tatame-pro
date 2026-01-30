/**
 * CORE BILLING RESOLVER
 * Fonte de verdade única para estado de billing do tenant
 * 
 * REGRAS IMUTÁVEIS:
 * 1. Se is_manual_override = true → Stripe é COMPLETAMENTE ignorado
 * 2. canUseStripe = !isManualOverride
 * 3. Fallback é SEMPRE restritivo (isReadOnly: true, isBlocked: true)
 * 
 * GROWTH TRIAL STATES:
 * - TRIALING: Trial ativo (7 dias), acesso total
 * - TRIAL_EXPIRED: Grace period (8 dias), ações sensíveis bloqueadas
 * - PENDING_DELETE: Aguardando deleção, tenant bloqueado
 */

export type BillingStatus =
  | 'ACTIVE'
  | 'TRIALING'
  | 'TRIAL_EXPIRED'
  | 'PENDING_DELETE'
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
  // Growth Trial states
  isTrialActive: boolean;
  isTrialExpired: boolean;
  isPendingDelete: boolean;
  canPerformSensitiveActions: boolean;
}

// Raw types for input data
interface RawBillingData {
  status: string | null;
  is_manual_override: boolean;
  override_reason?: string | null;
  override_at?: string | null;
  trial_expires_at?: string | null;
  grace_period_ends_at?: string | null;
  scheduled_delete_at?: string | null;
}

interface RawTenantData {
  is_active: boolean;
}

const VALID_STATUSES: BillingStatus[] = [
  'ACTIVE', 'TRIALING', 'TRIAL_EXPIRED', 'PENDING_DELETE',
  'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE'
];

/**
 * BILLING TRANSITION MATRIX — DIAGNOSTIC ONLY
 * 
 * CRITICAL CONSTRAINT (per approval):
 * This matrix is ONLY for logging and diagnostics.
 * It does NOT enforce transitions.
 * It does NOT block execution.
 * Invalid transitions generate observable warning, never blocking.
 */
const VALID_BILLING_TRANSITIONS: Record<BillingStatus, readonly BillingStatus[]> = {
  TRIALING: ['ACTIVE', 'TRIAL_EXPIRED'],
  TRIAL_EXPIRED: ['ACTIVE', 'PENDING_DELETE'],
  PENDING_DELETE: ['ACTIVE'], // Reactivation only
  ACTIVE: ['PAST_DUE', 'CANCELED', 'UNPAID'],
  PAST_DUE: ['ACTIVE', 'UNPAID', 'CANCELED'],
  UNPAID: ['ACTIVE', 'CANCELED'],
  CANCELED: ['ACTIVE'], // Reactivation
  INCOMPLETE: ['ACTIVE', 'TRIALING'],
} as const;

/**
 * Logs diagnostic warning for invalid status or transitions.
 * Does NOT block — this is for observability only.
 */
function logBillingDiagnostic(
  type: 'INVALID_STATUS' | 'UNEXPECTED_TRANSITION',
  details: Record<string, unknown>
): void {
  console.warn(`[BILLING DIAGNOSTIC] ${type}`, {
    ...details,
    timestamp: new Date().toISOString(),
    note: 'This is a diagnostic warning. No enforcement applied.',
  });
}

export function resolveTenantBillingState(
  billing: RawBillingData | null,
  tenant: RawTenantData | null
): TenantBillingState {
  // Calculate isManualOverride BEFORE fallback
  const isManualOverride = billing?.is_manual_override === true;
  
  // Fallback when data is missing - ALWAYS RESTRICTIVE
  if (!billing || !tenant) {
    return {
      status: 'INCOMPLETE',
      isManualOverride,
      isActive: false,
      isReadOnly: true,
      isBlocked: true,
      canUseStripe: !isManualOverride,
      source: isManualOverride ? 'MANUAL_OVERRIDE' : 'STRIPE',
      overrideReason: billing?.override_reason ?? null,
      overrideAt: billing?.override_at ? new Date(billing.override_at) : null,
      // Growth Trial states - restrictive fallback
      isTrialActive: false,
      isTrialExpired: false,
      isPendingDelete: false,
      canPerformSensitiveActions: false,
    };
  }

  // Normalize status BEFORE any usage
  const rawStatus = (billing.status || 'INCOMPLETE').toUpperCase() as BillingStatus;
  const status: BillingStatus = VALID_STATUSES.includes(rawStatus)
    ? rawStatus
    : 'INCOMPLETE';

  // Source and canUseStripe
  const source: BillingSource = isManualOverride ? 'MANUAL_OVERRIDE' : 'STRIPE';
  const canUseStripe = !isManualOverride;

  // Growth Trial derived flags
  const isTrialActive = status === 'TRIALING';
  const isTrialExpired = status === 'TRIAL_EXPIRED';
  const isPendingDelete = status === 'PENDING_DELETE';

  // isActive respects manual override
  const isActive = isManualOverride
    ? status === 'ACTIVE' || status === 'TRIALING'
    : tenant.is_active === true;

  // Derived flags - PENDING_DELETE and CANCELED are blocked
  const isBlocked = !isActive || isPendingDelete || status === 'CANCELED';
  
  // Read-only includes TRIAL_EXPIRED for grace period restrictions
  const isReadOnly = ['PAST_DUE', 'UNPAID', 'INCOMPLETE', 'TRIAL_EXPIRED'].includes(status);

  // Sensitive actions only allowed when fully active
  const canPerformSensitiveActions = ['ACTIVE', 'TRIALING'].includes(status) && !isBlocked;

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
    // Growth Trial states
    isTrialActive,
    isTrialExpired,
    isPendingDelete,
    canPerformSensitiveActions,
  };
}
