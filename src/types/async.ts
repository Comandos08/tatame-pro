/**
 * ============================================================================
 * PI B1 — AsyncState Contract
 * ============================================================================
 *
 * Canonical contract for ALL async flows in the system.
 *
 * INVARIANTS (SAFE GOLD):
 * - state is NEVER undefined
 * - data is ONLY non-null when state === 'OK'
 * - error is ONLY non-null when state === 'ERROR'
 * - Decisions MUST be based on `state`, never on `if (data)` or truthiness
 * ============================================================================
 */

export type SystemState = 'EMPTY' | 'LOADING' | 'OK' | 'ERROR';

export interface AsyncState<T> {
  /** Explicit, deterministic state — the ONLY field used for flow decisions */
  state: SystemState;
  /** Data payload — guaranteed non-null only when state === 'OK' */
  data: T | null;
  /** Error payload — guaranteed non-null only when state === 'ERROR' */
  error: Error | null;
}
