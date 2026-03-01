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

/**
 * ═══════════════════════════════════════════════════════════════════════
 * BILLING STATUS MAPPING — CROSS-SYSTEM REFERENCE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Este módulo usa 8 status granulares derivados do Stripe/subscription state.
 * Outros módulos consomem subconjuntos via TenantFlagsContract (RPC).
 *
 * ┌──────────────────────────┬────────────────────────────────────────┐
 * │ resolveTenantBillingState│ TenantFlagsContract.billing.status    │
 * │ (este módulo)            │ (RPC get_tenant_flags_contract)       │
 * ├──────────────────────────┼────────────────────────────────────────┤
 * │ ACTIVE                   │ ACTIVE                                │
 * │ TRIALING                 │ TRIALING                              │
 * │ PAST_DUE                 │ PAST_DUE                              │
 * │ TRIAL_EXPIRED            │ BLOCKED                               │
 * │ PENDING_DELETE           │ BLOCKED                               │
 * │ CANCELED                 │ BLOCKED                               │
 * │ UNPAID                   │ BLOCKED                               │
 * │ INCOMPLETE               │ UNKNOWN                               │
 * └──────────────────────────┴────────────────────────────────────────┘
 *
 * IMPORTANTE:
 * - BillingGate e TenantLayout consomem SOMENTE TenantFlagsContract.
 * - Este resolver é usado por useTenantStatus (banners, diagnóstico, UX).
 * - Decisões de BLOQUEIO financeiro SEMPRE passam pelo TenantFlagsContract (RPC).
 * - Divergências são intencionais e fazem parte do design multi-camada.
 *
 * ═══════════════════════════════════════════════════════════════════════
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
  // P3.2.6 — Explicit suspension flag
  isSuspended: boolean;
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
      // P3.2.6 — Explicit suspension flag
      isSuspended: true, // Restrictive fallback
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

  // P3.2.6 — Explicit suspension mapping
  const isSuspended = status === 'CANCELED' || status === 'PENDING_DELETE';

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
    // P3.2.6 — Explicit suspension flag
    isSuspended,
  };
}
