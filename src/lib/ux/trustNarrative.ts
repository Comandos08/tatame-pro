/**
 * PI U17 — TRUST_NARRATIVE (Pure Derivation)
 *
 * Institutional narrative layer that translates BlockReason (U12)
 * into trust-reinforcing messages. Does NOT decide state, grant
 * access, or suggest actions.
 *
 * CONTRACT:
 * - 100% derived from BlockReason (U12 SSoT)
 * - Fail-closed: no reason → no narrative
 * - No CTA, no action, no emotion
 * - Does not appear on happy path
 *
 * NO React, NO Supabase, NO side effects.
 */

import type { BlockReason } from './blockReason';

// ── Types ──────────────────────────────────────────────────────────────────

export type TrustNarrativeKind = 'WAITING' | 'BLOCKED' | 'INFO';

export interface TrustNarrative {
  kind: TrustNarrativeKind;
  titleKey: string;
  messageKey: string;
  reason: BlockReason;
}

// ── Canonical Mapping (SSoT) ───────────────────────────────────────────────

const TRUST_NARRATIVE_MAP: Record<BlockReason, TrustNarrative> = {
  IDENTITY_LOADING: {
    kind: 'WAITING',
    titleKey: 'trust.narrative.identityLoading.title',
    messageKey: 'trust.narrative.identityLoading.message',
    reason: 'IDENTITY_LOADING',
  },
  TENANT_BLOCKED: {
    kind: 'BLOCKED',
    titleKey: 'trust.narrative.tenantBlocked.title',
    messageKey: 'trust.narrative.tenantBlocked.message',
    reason: 'TENANT_BLOCKED',
  },
  BILLING_BLOCKED: {
    kind: 'BLOCKED',
    titleKey: 'trust.narrative.billingBlocked.title',
    messageKey: 'trust.narrative.billingBlocked.message',
    reason: 'BILLING_BLOCKED',
  },
  NO_PERMISSION: {
    kind: 'BLOCKED',
    titleKey: 'trust.narrative.noPermission.title',
    messageKey: 'trust.narrative.noPermission.message',
    reason: 'NO_PERMISSION',
  },
  FEATURE_DISABLED: {
    kind: 'INFO',
    titleKey: 'trust.narrative.featureDisabled.title',
    messageKey: 'trust.narrative.featureDisabled.message',
    reason: 'FEATURE_DISABLED',
  },
  NO_DATA: {
    kind: 'INFO',
    titleKey: 'trust.narrative.noData.title',
    messageKey: 'trust.narrative.noData.message',
    reason: 'NO_DATA',
  },
} as const;

// ── Derivation ─────────────────────────────────────────────────────────────

/**
 * Derive institutional trust narrative from a BlockReason.
 * Returns null on happy path (no block reason).
 */
export function deriveTrustNarrative(
  blockReason: BlockReason | null,
): TrustNarrative | null {
  if (!blockReason) return null;
  return TRUST_NARRATIVE_MAP[blockReason] ?? null;
}
