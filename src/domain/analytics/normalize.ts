/**
 * ANALYTICS SAFE GOLD — Normalizers v2.0
 *
 * Pure functions for mapping runtime values to SAFE GOLD states.
 * No Date, Math.random, UUID, timezone, or IO dependencies.
 */

import type {
  SafeAnalyticsMetric,
  SafeAnalyticsViewState,
  SafeAnalyticsScope,
} from '@/types/analytics-state';

import {
  SAFE_ANALYTICS_METRICS,
  SAFE_ANALYTICS_SCOPES,
  PRODUCTION_TO_SAFE_ANALYTICS_METRIC,
} from '@/types/analytics-state';

// ============================================
// VIEW STATE NORMALIZERS
// ============================================

/**
 * Normalize analytics view state from raw input.
 * Pure function — NO side effects, NO Date, NO exceptions.
 * 
 * @param input - Raw state from API/UI
 * @returns Deterministic SafeAnalyticsViewState
 */
export function normalizeAnalyticsViewState(
  input: unknown
): SafeAnalyticsViewState {
  // Null/undefined → EMPTY (not error, just no data)
  if (input === null || input === undefined) return 'EMPTY';

  // Array handling
  if (Array.isArray(input)) {
    if (input.length === 0) return 'EMPTY';
    return 'OK';
  }

  // Object handling
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;

    // Explicit error indicators
    if (obj.error || obj.isError || obj.status === 'error') return 'ERROR';

    // Partial data indicators
    if (obj.partial || obj.incomplete || obj.degraded) return 'PARTIAL';

    // Has data property - recurse
    if ('data' in obj) {
      return normalizeAnalyticsViewState(obj.data);
    }

    // Empty object → EMPTY
    if (Object.keys(obj).length === 0) return 'EMPTY';

    // Non-empty object → OK
    return 'OK';
  }

  // Primitive truthy values → OK
  if (input) return 'OK';

  // Fallback for edge cases (0, false, '') → EMPTY
  return 'EMPTY';
}

// ============================================
// METRIC NORMALIZERS
// ============================================

/**
 * Assert metric belongs to SAFE GOLD subset.
 * Falls back to 'TOTAL_ATHLETES' for unknown values.
 */
export function assertAnalyticsMetric(v: string | null | undefined): SafeAnalyticsMetric {
  const raw = (v ?? '').trim();
  if (!raw) return 'TOTAL_ATHLETES';

  const upper = raw.toUpperCase();

  // Direct match in SAFE subset
  if (SAFE_ANALYTICS_METRICS.includes(upper as SafeAnalyticsMetric)) {
    return upper as SafeAnalyticsMetric;
  }

  // Production mapping
  const mapped = PRODUCTION_TO_SAFE_ANALYTICS_METRIC[upper];
  if (mapped) return mapped;

  return 'TOTAL_ATHLETES';
}

/**
 * Assert scope belongs to SAFE GOLD subset.
 * Falls back to 'TENANT' for unknown values.
 */
export function assertAnalyticsScope(v: string | null | undefined): SafeAnalyticsScope {
  const raw = (v ?? '').trim();
  if (!raw) return 'TENANT';

  const upper = raw.toUpperCase();

  if (SAFE_ANALYTICS_SCOPES.includes(upper as SafeAnalyticsScope)) {
    return upper as SafeAnalyticsScope;
  }

  return 'TENANT';
}

// ============================================
// PURE AGGREGATION FUNCTIONS
// ============================================

/**
 * Count items in array.
 * Pure function — deterministic output.
 */
export function aggregateCount(items: readonly unknown[]): number {
  return items.length;
}

/**
 * Sum numeric values.
 * Pure function — deterministic output.
 */
export function aggregateSum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Calculate average of numeric values.
 * Pure function — deterministic output.
 * Returns 0 for empty arrays (no division by zero).
 */
export function aggregateAverage(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return aggregateSum(values) / values.length;
}

/**
 * Find minimum value.
 * Pure function — deterministic output.
 * Returns 0 for empty arrays.
 */
export function aggregateMin(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}

/**
 * Find maximum value.
 * Pure function — deterministic output.
 * Returns 0 for empty arrays.
 */
export function aggregateMax(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

/**
 * Group items by key.
 * Pure function — deterministic output.
 */
export function groupBy<T>(
  items: readonly T[],
  keyFn: (item: T) => string
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
  }
  
  return result;
}

// ============================================
// ROUTE DETECTION
// ============================================

/**
 * Check if current route is an analytics route.
 * Pure function for DOM instrumentation.
 */
export function isAnalyticsRoute(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return (
    lower.includes('/analytics') ||
    lower.includes('/dashboard') ||
    lower.includes('/reports') ||
    lower.includes('/metrics') ||
    lower.includes('/stats')
  );
}

/**
 * Derive analytics metrics from route context.
 * Pure function for DOM instrumentation.
 */
export function deriveActiveMetrics(pathname: string): SafeAnalyticsMetric[] {
  const lower = pathname.toLowerCase();
  
  // Route-based metric detection
  if (lower.includes('/athletes')) return ['TOTAL_ATHLETES'];
  if (lower.includes('/memberships')) return ['ACTIVE_MEMBERSHIPS', 'EXPIRED_MEMBERSHIPS'];
  if (lower.includes('/events')) return ['EVENTS_COUNT', 'EVENTS_ACTIVE'];
  if (lower.includes('/billing') || lower.includes('/revenue')) return ['REVENUE_TOTAL', 'REVENUE_MRR'];
  
  // Default: all metrics on dashboard
  if (lower.includes('/dashboard') || lower.includes('/analytics')) {
    return [...SAFE_ANALYTICS_METRICS];
  }
  
  return [];
}
