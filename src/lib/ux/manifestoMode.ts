/**
 * PI U19 — MANIFESTO_MODE (Pure Derivation)
 *
 * Institutional identity layer that affirms system health and values.
 * Only appears when the system is fully healthy (no BlockReason, no loading, no error).
 *
 * CONTRACT:
 * - Depends exclusively on BlockReason (U12 SSoT)
 * - Fail-silent: any doubt → null
 * - No CTA, no action, no dismiss
 * - Only appears on happy path
 *
 * NO React, NO Supabase, NO side effects.
 */

import type { BlockReason } from './blockReason';

// ── Types ──────────────────────────────────────────────────────────────────

export type ManifestoKind = 'INSTITUTIONAL';

export interface Manifesto {
  kind: ManifestoKind;
  titleKey: string;
  messageKey: string;
}

// ── Derivation ─────────────────────────────────────────────────────────────

/**
 * Derive institutional manifesto.
 *
 * Rules (fail-silent):
 * 1. Loading → null
 * 2. Error → null
 * 3. Any BlockReason → null
 * 4. Otherwise → institutional manifesto
 */
export function deriveManifestoMode(
  blockReason: BlockReason | null,
  isLoading: boolean,
  isError: boolean,
): Manifesto | null {
  if (isLoading) return null;
  if (isError) return null;
  if (blockReason) return null;

  return {
    kind: 'INSTITUTIONAL',
    titleKey: 'manifesto.title',
    messageKey: 'manifesto.message',
  };
}
