/**
 * OBSERVABILITY SAFE GOLD — v1.0
 *
 * Core observability module.
 * Best-effort emission, fallback to console.
 * If observability fails, the system continues.
 * 
 * DETERMINISM RULE: Observability NEVER creates time.
 * Timestamp is REQUIRED and must be provided by caller.
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
 * - TIMESTAMP IS REQUIRED (no generation)
 */
export function emitObservableEvent(event: ObservableEvent): void {
  if (!event?.timestamp) {
    console.warn(
      '[OBSERVABILITY] Event ignored — timestamp is required (SAFE GOLD)',
      event
    );
    return;
  }

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
    console.error('[OBSERVABILITY_FAILED]', err);
  }
}

/**
 * Validate and pass through event.
 * 
 * SAFE GOLD: Does NOT generate timestamp.
 * Timestamp must be provided by caller.
 */
export function createEvent(event: ObservableEvent): ObservableEvent {
  if (!event.timestamp) {
    console.warn(
      '[OBSERVABILITY] Event dropped: missing deterministic timestamp',
      event
    );
  }
  return event;
}
