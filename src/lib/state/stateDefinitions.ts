/**
 * PI U3 — STATE_DEFINITION (Canonical State Contract)
 *
 * Single Source of Truth for all system states.
 * No business logic. No inference. No booleans.
 *
 * Every behavioral decision in the system MUST derive
 * from one of these explicit, finite state sets.
 *
 * FROZEN CONTRACT — changes require explicit PI approval.
 */

// ============================================================================
// 🏢 TENANT LIFECYCLE
// ============================================================================

/**
 * Governs tenant operational status.
 *
 * SETUP      → Onboarding incompleto
 * ACTIVE     → Operacional (único estado que permite /app/*)
 * SUSPENDED  → Bloqueio administrativo/manual (leitura + aviso)
 * INACTIVE   → Encerrado (soft delete)
 * DELETED    → Histórico apenas (nunca acessível)
 */
export type TenantLifecycleStatus =
  | 'SETUP'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'INACTIVE'
  | 'DELETED';

export const TENANT_LIFECYCLE_STATUSES: readonly TenantLifecycleStatus[] = [
  'SETUP',
  'ACTIVE',
  'SUSPENDED',
  'INACTIVE',
  'DELETED',
] as const;

/**
 * Valid transitions for TenantLifecycleStatus.
 * Any transition not listed here is INVALID.
 */
export const TENANT_TRANSITIONS: Record<TenantLifecycleStatus, readonly TenantLifecycleStatus[]> = {
  SETUP:     ['ACTIVE'],
  ACTIVE:    ['SUSPENDED', 'INACTIVE'],
  SUSPENDED: ['ACTIVE'],
  INACTIVE:  ['DELETED'],
  DELETED:   [],
};

// ============================================================================
// 👤 MEMBERSHIP
// ============================================================================

/**
 * Governs individual membership lifecycle.
 *
 * PENDING    → Criado, aguardando aprovação
 * ACTIVE     → Válido (check-in, diplomas permitidos)
 * EXPIRED    → Validade vencida (semântica temporal)
 * SUSPENDED  → Bloqueado administrativamente
 * CANCELLED  → Encerrado manualmente (semântica de decisão)
 */
export type MembershipStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'CANCELLED';

export const MEMBERSHIP_STATUSES: readonly MembershipStatus[] = [
  'PENDING',
  'ACTIVE',
  'EXPIRED',
  'SUSPENDED',
  'CANCELLED',
] as const;

/**
 * Valid transitions for MembershipStatus.
 */
export const MEMBERSHIP_TRANSITIONS: Record<MembershipStatus, readonly MembershipStatus[]> = {
  PENDING:   ['ACTIVE'],
  ACTIVE:    ['EXPIRED', 'SUSPENDED', 'CANCELLED'],
  EXPIRED:   [],
  SUSPENDED: ['ACTIVE'],
  CANCELLED: [],
};

// ============================================================================
// 💳 BILLING / SUBSCRIPTION
// ============================================================================

/**
 * Governs tenant billing/subscription state.
 *
 * INCOMPLETE → Checkout iniciado, não finalizado
 * TRIAL      → Período de avaliação
 * ACTIVE     → Pagamento em dia
 * PAST_DUE   → Pagamento atrasado (NÃO é bloqueio imediato)
 * SUSPENDED  → Bloqueio institucional por inadimplência
 * CANCELLED  → Assinatura encerrada
 */
export type SubscriptionStatus =
  | 'INCOMPLETE'
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CANCELLED';

export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'INCOMPLETE',
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELLED',
] as const;

/**
 * Valid transitions for SubscriptionStatus.
 */
export const SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  INCOMPLETE: ['TRIAL'],
  TRIAL:      ['ACTIVE'],
  ACTIVE:     ['PAST_DUE'],
  PAST_DUE:   ['SUSPENDED'],
  SUSPENDED:  ['ACTIVE', 'CANCELLED'],
  CANCELLED:  [],
};

// ============================================================================
// 🔐 USER ACCESS SCOPE (Identity Roles — exactly 3)
// ============================================================================

/**
 * Canonical identity roles. Exhaustive and final.
 *
 * SUPERADMIN   → Plataforma global
 * TENANT_ADMIN → Gestão organizacional
 * ATHLETE      → Jornada pessoal
 *
 * ❌ Coach, Professor, Staff, Instructor → NÃO são roles.
 * ✅ Reconhecimento contextual → badge (visual only).
 * ✅ Permissão funcional → can(feature).
 */
export type UserAccessScope =
  | 'SUPERADMIN'
  | 'TENANT_ADMIN'
  | 'ATHLETE';

export const USER_ACCESS_SCOPES: readonly UserAccessScope[] = [
  'SUPERADMIN',
  'TENANT_ADMIN',
  'ATHLETE',
] as const;
