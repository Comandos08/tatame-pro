/**
 * PI U13 — EMPTY_STATE_AUTHORITY (Pure Derivation)
 *
 * Authoritative, deterministic, semantic empty states.
 * Never lies. Never suggests unauthorized actions. Never infers intent.
 *
 * CONTRACT:
 * - Derived exclusively from explicit system state
 * - No navigation, no permissions, no access decisions
 * - CTA never automatic — INFO or BLOCKED only
 * - Priority order is absolute and immutable
 *
 * NO React, NO Supabase, NO side effects.
 */

import type { TenantLifecycleState } from '@/types/tenant-lifecycle-state';
import type { BillingStatus } from '@/lib/billing';

// ── Types ──────────────────────────────────────────────────────────────────

export type EmptyStateKind = 'INFO' | 'BLOCKED' | 'WAITING';

export type EmptyStateReason =
  | 'NO_DATA'
  | 'NO_PERMISSION'
  | 'TENANT_BLOCKED'
  | 'BILLING_BLOCKED'
  | 'IDENTITY_LOADING'
  | 'FEATURE_DISABLED';

export type EmptyStateIcon = 'INFO' | 'LOCK' | 'CLOCK';

export interface EmptyState {
  kind: EmptyStateKind;
  reason: EmptyStateReason;
  titleKey: string;
  descriptionKey: string;
  icon: EmptyStateIcon;
}

export interface EmptyStateInput {
  hasData: boolean;
  canAccess: boolean;
  isLoading: boolean;
  tenantLifecycle: TenantLifecycleState | null;
  billingStatus: BillingStatus | null;
  featureEnabled?: boolean;
}

// ── Derivation ─────────────────────────────────────────────────────────────

/**
 * Derive empty state from current institutional state.
 *
 * Priority order (ABSOLUTE):
 * 1. Loading → WAITING
 * 2. Tenant BLOCKED/DELETED → BLOCKED
 * 3. Billing PAST_DUE/UNPAID/PENDING_DELETE → BLOCKED
 * 4. No permission → BLOCKED
 * 5. Feature disabled → INFO
 * 6. No data → INFO
 * 7. Default → null (data exists, everything OK)
 */
export function deriveEmptyState(input: EmptyStateInput): EmptyState | null {
  // 1. Loading — system not ready
  if (input.isLoading) {
    return {
      kind: 'WAITING',
      reason: 'IDENTITY_LOADING',
      titleKey: 'emptyState.loading.title',
      descriptionKey: 'emptyState.loading.description',
      icon: 'CLOCK',
    };
  }

  // 2. Tenant blocked or deleted
  if (input.tenantLifecycle === 'BLOCKED' || input.tenantLifecycle === 'DELETED') {
    return {
      kind: 'BLOCKED',
      reason: 'TENANT_BLOCKED',
      titleKey: 'emptyState.tenantBlocked.title',
      descriptionKey: 'emptyState.tenantBlocked.description',
      icon: 'LOCK',
    };
  }

  // 3. Billing blocked
  if (
    input.billingStatus === 'PAST_DUE' ||
    input.billingStatus === 'UNPAID' ||
    input.billingStatus === 'PENDING_DELETE'
  ) {
    return {
      kind: 'BLOCKED',
      reason: 'BILLING_BLOCKED',
      titleKey: 'emptyState.billingBlocked.title',
      descriptionKey: 'emptyState.billingBlocked.description',
      icon: 'LOCK',
    };
  }

  // 4. No permission
  if (!input.canAccess) {
    return {
      kind: 'BLOCKED',
      reason: 'NO_PERMISSION',
      titleKey: 'emptyState.noPermission.title',
      descriptionKey: 'emptyState.noPermission.description',
      icon: 'LOCK',
    };
  }

  // 5. Feature disabled
  if (input.featureEnabled === false) {
    return {
      kind: 'INFO',
      reason: 'FEATURE_DISABLED',
      titleKey: 'emptyState.featureDisabled.title',
      descriptionKey: 'emptyState.featureDisabled.description',
      icon: 'INFO',
    };
  }

  // 6. No data
  if (!input.hasData) {
    return {
      kind: 'INFO',
      reason: 'NO_DATA',
      titleKey: 'emptyState.noData.title',
      descriptionKey: 'emptyState.noData.description',
      icon: 'INFO',
    };
  }

  // 7. Data exists, everything OK → no empty state
  return null;
}
