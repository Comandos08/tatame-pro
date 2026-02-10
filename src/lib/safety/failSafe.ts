/**
 * PI U9 — FAIL_SAFE_DEFAULTS
 *
 * Pure utility helpers enforcing deny-by-default across the system.
 * No React, no Supabase, no side effects.
 *
 * Principle: any absence of data, error, or intermediate state = DENY.
 */

// ---------------------------------------------------------------------------
// Primitive fail-safe coercions
// ---------------------------------------------------------------------------

/** Coerce unknown to boolean, defaulting to false */
export function failSafeBoolean(input: unknown, fallback = false): boolean {
  if (typeof input === 'boolean') return input;
  return fallback;
}

/** Coerce unknown to string, defaulting to '' */
export function failSafeString(input: unknown, fallback = ''): string {
  if (typeof input === 'string') return input;
  return fallback;
}

/** Coerce unknown to array, defaulting to [] */
export function failSafeArray<T>(input: unknown, fallback: T[] = []): T[] {
  if (Array.isArray(input)) return input as T[];
  return fallback;
}

/** Coerce unknown to plain object, defaulting to {} */
export function failSafeObject(
  input: unknown,
  fallback: Record<string, unknown> = {},
): Record<string, unknown> {
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return fallback;
}

/** Validate value is one of the allowed enum members, else fallback */
export function failSafeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Access-control fail-safe
// ---------------------------------------------------------------------------

/**
 * Fail-closed access check.
 * Returns true ONLY when canValue is explicitly true AND
 * the system is neither loading nor in error.
 */
export function failSafeAccess(
  canValue: boolean | undefined | null,
  isLoading?: boolean,
  isError?: boolean,
): boolean {
  if (isLoading) return false;
  if (isError) return false;
  if (canValue !== true) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Render gate
// ---------------------------------------------------------------------------

export type RenderGateDecision = 'ALLOW' | 'DENY' | 'LOADING';

/**
 * Determine render gate state.
 * Only ALLOW when explicitly resolved and granted.
 */
export function failSafeRenderGate(state: {
  isLoading: boolean;
  isError: boolean;
  isGranted: boolean;
}): RenderGateDecision {
  if (state.isLoading) return 'LOADING';
  if (state.isError) return 'DENY';
  if (!state.isGranted) return 'DENY';
  return 'ALLOW';
}
