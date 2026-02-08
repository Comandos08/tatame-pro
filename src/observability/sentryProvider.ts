/**
 * OBSERVABILITY SAFE GOLD — v1.0
 *
 * Optional Sentry provider.
 * Only active if VITE_SENTRY_ENABLED is set.
 * 
 * Usage in main.tsx:
 * ```
 * if (import.meta.env.VITE_SENTRY_ENABLED === 'true') {
 *   registerObservabilityProvider(sentryProvider);
 * }
 * ```
 */

import type { ObservableEvent } from './types';

/**
 * Map SAFE_EVENT_LEVELS to Sentry severity levels
 */
const LEVEL_MAP: Record<string, 'info' | 'warning' | 'error' | 'fatal'> = {
  INFO: 'info',
  WARN: 'warning',
  ERROR: 'error',
  CRITICAL: 'fatal',
};

/**
 * Sentry-compatible provider.
 * 
 * NOTE: This is a stub implementation.
 * To use real Sentry, install @sentry/react and configure:
 * 
 * ```typescript
 * import * as Sentry from '@sentry/react';
 * 
 * export function sentryProvider(event: ObservableEvent) {
 *   Sentry.captureMessage(event.name, {
 *     level: LEVEL_MAP[event.level] || 'info',
 *     extra: {
 *       domain: event.domain,
 *       message: event.message,
 *       tenant_id: event.tenant_id,
 *       user_id: event.user_id,
 *       metadata: event.metadata,
 *       timestamp: event.timestamp,
 *     },
 *     tags: {
 *       domain: event.domain,
 *       level: event.level,
 *     },
 *   });
 * }
 * ```
 */
export function sentryProvider(event: ObservableEvent): void {
  // Stub: logs to console in Sentry format
  const level = LEVEL_MAP[event.level] || 'info';
  console.log(`[SENTRY:${level}]`, event.name, {
    domain: event.domain,
    message: event.message,
    tenant_id: event.tenant_id,
    user_id: event.user_id,
    metadata: event.metadata,
    timestamp: event.timestamp,
  });
}

/**
 * Datadog-compatible provider stub
 */
export function datadogProvider(event: ObservableEvent): void {
  console.log('[DATADOG]', event.name, event);
}
