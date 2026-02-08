/**
 * ANALYTICS SAFE GOLD — v2.0
 *
 * Contrato mínimo, estável e congelado para métricas e agregações.
 * NÃO representa domínio completo.
 * Qualquer expansão exige novo PI SAFE GOLD.
 */

// ============================================
// ANALYTICS2.0 — METRIC ENUMS
// ============================================

/**
 * SAFE GOLD Analytics Metrics
 * Closed set of permitted metrics for analytics operations.
 */
export const SAFE_ANALYTICS_METRICS = [
  'TOTAL_ATHLETES',
  'ACTIVE_MEMBERSHIPS',
  'EXPIRED_MEMBERSHIPS',
  'REVENUE_TOTAL',
  'REVENUE_MRR',
  'EVENTS_COUNT',
  'EVENTS_ACTIVE',
] as const;

export type SafeAnalyticsMetric = typeof SAFE_ANALYTICS_METRICS[number];

/**
 * SAFE GOLD Analytics View States
 * - OK: Data loaded successfully
 * - EMPTY: No data available (not an error)
 * - PARTIAL: Incomplete data (degraded mode)
 * - ERROR: Failed to load
 */
export const SAFE_ANALYTICS_VIEW_STATES = [
  'OK',
  'EMPTY',
  'PARTIAL',
  'ERROR',
] as const;

export type SafeAnalyticsViewState = typeof SAFE_ANALYTICS_VIEW_STATES[number];

/**
 * SAFE GOLD Analytics Scopes
 */
export const SAFE_ANALYTICS_SCOPES = [
  'TENANT',
  'GLOBAL',
] as const;

export type SafeAnalyticsScope = typeof SAFE_ANALYTICS_SCOPES[number];

/**
 * Production → SAFE GOLD mapping (metrics)
 */
export const PRODUCTION_TO_SAFE_ANALYTICS_METRIC: Record<string, SafeAnalyticsMetric> = {
  'TOTAL_ATHLETES': 'TOTAL_ATHLETES',
  'ATHLETES_COUNT': 'TOTAL_ATHLETES',
  'ATHLETES': 'TOTAL_ATHLETES',
  
  'ACTIVE_MEMBERSHIPS': 'ACTIVE_MEMBERSHIPS',
  'MEMBERSHIPS_ACTIVE': 'ACTIVE_MEMBERSHIPS',
  'ACTIVE_MEMBERS': 'ACTIVE_MEMBERSHIPS',
  
  'EXPIRED_MEMBERSHIPS': 'EXPIRED_MEMBERSHIPS',
  'MEMBERSHIPS_EXPIRED': 'EXPIRED_MEMBERSHIPS',
  'INACTIVE_MEMBERS': 'EXPIRED_MEMBERSHIPS',
  
  'REVENUE_TOTAL': 'REVENUE_TOTAL',
  'TOTAL_REVENUE': 'REVENUE_TOTAL',
  'REVENUE': 'REVENUE_TOTAL',
  
  'REVENUE_MRR': 'REVENUE_MRR',
  'MRR': 'REVENUE_MRR',
  'MONTHLY_REVENUE': 'REVENUE_MRR',
  
  'EVENTS_COUNT': 'EVENTS_COUNT',
  'TOTAL_EVENTS': 'EVENTS_COUNT',
  'EVENTS': 'EVENTS_COUNT',
  
  'EVENTS_ACTIVE': 'EVENTS_ACTIVE',
  'ACTIVE_EVENTS': 'EVENTS_ACTIVE',
};
