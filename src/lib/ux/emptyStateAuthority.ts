/**
 * PI U13 — EMPTY_STATE_AUTHORITY (Pure Derivation)
 *
 * Authoritative, deterministic, semantic empty states.
 * Now delegates block reason derivation to U12 (BlockReason SSoT).
 *
 * CONTRACT:
 * - Derived exclusively from BlockReason (U12)
 * - No navigation, no permissions, no access decisions
 * - CTA never automatic — INFO or BLOCKED only
 *
 * NO React, NO Supabase, NO side effects.
 */

import type { TenantLifecycleState } from '@/types/tenant-lifecycle-state';
import type { BillingStatus } from '@/lib/billing';
import {
  deriveBlockReason,
  BLOCK_REASON_UI,
  BLOCK_REASON_I18N,
  type BlockReason,
} from './blockReason';

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
 * Delegates to deriveBlockReason (U12) as SSoT, then maps to EmptyState.
 */
export function deriveEmptyState(input: EmptyStateInput): EmptyState | null {
  const blockReason = deriveBlockReason({
    isLoading: input.isLoading,
    canAccess: input.canAccess,
    tenantLifecycle: input.tenantLifecycle,
    billingStatus: input.billingStatus,
    featureEnabled: input.featureEnabled,
    hasData: input.hasData,
  });

  if (!blockReason) return null;

  return mapBlockReasonToEmptyState(blockReason);
}

/**
 * Map a BlockReason to an EmptyState using canonical UI + i18n mappings.
 */
export function mapBlockReasonToEmptyState(reason: BlockReason): EmptyState {
  const ui = BLOCK_REASON_UI[reason];
  const i18n = BLOCK_REASON_I18N[reason];

  return {
    kind: ui.kind as EmptyStateKind,
    reason: reason as EmptyStateReason,
    titleKey: i18n.titleKey,
    descriptionKey: i18n.descriptionKey,
    icon: ui.icon as EmptyStateIcon,
  };
}
