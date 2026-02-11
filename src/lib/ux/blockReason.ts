/**
 * PI U12 — BLOCK_REASON_CLARITY (Pure Derivation)
 *
 * Single Source of Truth for why something is blocked RIGHT NOW.
 * Every UX artifact (EmptyState, NBA, ProgressFeedback) consumes
 * this derivation — none recalculates conditions independently.
 *
 * CONTRACT:
 * - Returns at most ONE reason (highest priority wins)
 * - Never returns text — only semantic enum
 * - Never depends on UI
 * - Priority order is absolute and immutable
 *
 * NO React, NO Supabase, NO side effects.
 */

import type { TenantLifecycleState } from '@/types/tenant-lifecycle-state';
import type { BillingStatus } from '@/lib/billing';

// ── Types ──────────────────────────────────────────────────────────────────

export type BlockReason =
  | 'IDENTITY_LOADING'
  | 'TENANT_BLOCKED'
  | 'BILLING_BLOCKED'
  | 'NO_PERMISSION'
  | 'FEATURE_DISABLED'
  | 'NO_DATA';

export interface BlockReasonContext {
  isLoading: boolean;
  canAccess: boolean;
  tenantLifecycle: TenantLifecycleState | null;
  billingStatus: BillingStatus | null;
  billingOverride?: boolean;
  featureEnabled?: boolean;
  hasData?: boolean;
}

// ── UI Mapping ─────────────────────────────────────────────────────────────

export type BlockReasonUIKind = 'WAITING' | 'BLOCKED' | 'INFO';
export type BlockReasonUIIcon = 'CLOCK' | 'LOCK' | 'INFO';

export interface BlockReasonUI {
  kind: BlockReasonUIKind;
  icon: BlockReasonUIIcon;
}

export const BLOCK_REASON_UI: Record<BlockReason, BlockReasonUI> = {
  IDENTITY_LOADING: { kind: 'WAITING', icon: 'CLOCK' },
  TENANT_BLOCKED:   { kind: 'BLOCKED', icon: 'LOCK' },
  BILLING_BLOCKED:  { kind: 'BLOCKED', icon: 'LOCK' },
  NO_PERMISSION:    { kind: 'BLOCKED', icon: 'LOCK' },
  FEATURE_DISABLED: { kind: 'INFO',    icon: 'INFO' },
  NO_DATA:          { kind: 'INFO',    icon: 'INFO' },
} as const;

// ── i18n key mapping ───────────────────────────────────────────────────────

export const BLOCK_REASON_I18N: Record<BlockReason, { titleKey: string; descriptionKey: string }> = {
  IDENTITY_LOADING: { titleKey: 'emptyState.loading.title',        descriptionKey: 'emptyState.loading.description' },
  TENANT_BLOCKED:   { titleKey: 'emptyState.tenantBlocked.title',  descriptionKey: 'emptyState.tenantBlocked.description' },
  BILLING_BLOCKED:  { titleKey: 'emptyState.billingBlocked.title', descriptionKey: 'emptyState.billingBlocked.description' },
  NO_PERMISSION:    { titleKey: 'emptyState.noPermission.title',   descriptionKey: 'emptyState.noPermission.description' },
  FEATURE_DISABLED: { titleKey: 'emptyState.featureDisabled.title', descriptionKey: 'emptyState.featureDisabled.description' },
  NO_DATA:          { titleKey: 'emptyState.noData.title',          descriptionKey: 'emptyState.noData.description' },
} as const;

// ── Precedence (Institutional Contract) ────────────────────────────────────

/**
 * Canonical blocking precedence order.
 * See docs/DOMAIN_BLOCKING_HIERARCHY.md
 */
export const BLOCKING_PRECEDENCE = [
  'IDENTITY_LOADING',
  'TENANT_BLOCKED',
  'BILLING_BLOCKED',
  'NO_PERMISSION',
  'FEATURE_DISABLED',
  'NO_DATA',
] as const;

// ── Derivation ─────────────────────────────────────────────────────────────

/**
 * INSTITUTIONAL CONTRACT — Blocking Hierarchy
 *
 * Precedence order:
 * 1. Identity loading (system not ready)
 * 2. Tenant lifecycle (BLOCKED/DELETED — structural)
 * 3. Billing (PAST_DUE/UNPAID/PENDING_DELETE — unless billingOverride === true)
 * 4. Access (canAccess === false)
 * 5. Feature disabled
 * 6. No data
 *
 * Financial overrides NEVER bypass structural lifecycle blocks.
 *
 * See docs/DOMAIN_BLOCKING_HIERARCHY.md
 */
export function deriveBlockReason(ctx: BlockReasonContext): BlockReason | null {
  // 1. Loading — system not ready
  if (ctx.isLoading) return 'IDENTITY_LOADING';

  // 2. Tenant blocked or deleted
  if (ctx.tenantLifecycle === 'BLOCKED' || ctx.tenantLifecycle === 'DELETED') {
    return 'TENANT_BLOCKED';
  }

  // 3. Billing blocked (neutralized by manual override)
  if (
    !ctx.billingOverride &&
    (ctx.billingStatus === 'PAST_DUE' ||
     ctx.billingStatus === 'UNPAID' ||
     ctx.billingStatus === 'PENDING_DELETE')
  ) {
    return 'BILLING_BLOCKED';
  }

  // 4. No permission
  if (!ctx.canAccess) return 'NO_PERMISSION';

  // 5. Feature disabled
  if (ctx.featureEnabled === false) return 'FEATURE_DISABLED';

  // 6. No data
  if (ctx.hasData === false) return 'NO_DATA';

  // 7. Everything OK
  return null;
}
