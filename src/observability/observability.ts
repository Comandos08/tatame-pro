/**
 * OBSERVABILITY SAFE GOLD — v1.0
 *
 * Core observability module.
 * Best-effort emission, fallback to console.
 * If observability fails, the system continues.
 */

import type { ObservableEvent, ObservabilityProvider } from './types';

let provider: ObservabilityProvider | null = null;

/**
 * Register an external observability provider (Sentry, Datadog, etc.)
 * If not registered, events fallback to console.log
 */
export function registerObservabilityProvider(fn: ObservabilityProvider): void {
  provider = fn;
}

/**
 * Clear the registered provider (useful for testing)
 */
export function clearObservabilityProvider(): void {
  provider = null;
}

/**
 * Emit an observable event.
 * 
 * SAFE GOLD RULES:
 * - Best-effort: never throws
 * - No side effects
 * - No mutations
 * - No navigation/redirects
 * - Fallback to console if no provider
 */
export function emitObservableEvent(event: ObservableEvent): void {
  try {
    if (provider) {
      provider(event);
    } else {
      // Fallback to console
      const prefix = `[OBSERVABILITY:${event.domain}:${event.level}]`;
      console.log(prefix, event.name, event.message || '', event.metadata || {});
    }
  } catch (err) {
    // Never let observability break the app
    console.error('[OBSERVABILITY_FAILED]', err, event);
  }
}

/**
 * Helper to create events with defaults
 */
export function createEvent(
  partial: Omit<ObservableEvent, 'timestamp'> & { timestamp?: string }
): ObservableEvent {
  return {
    ...partial,
    timestamp: partial.timestamp || new Date().toISOString(),
  };
}
