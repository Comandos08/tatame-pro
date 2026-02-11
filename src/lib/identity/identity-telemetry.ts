/**
 * 📡 IDENTITY TELEMETRY — Production-safe, fire-and-forget
 *
 * P4 GUARANTEES:
 * - NO throws
 * - NO await blocking UI
 * - NO PII (user_id, email, tenant_id, profile_id)
 * - NO behavior change
 * - Sampling enabled (default 10%)
 */

export type IdentityTelemetryEvent =
  | 'identity.state_resolved'
  | 'identity.redirect_decision'
  | 'identity.error_state'
  | 'identity.wizard_required'
  | 'identity.superadmin_access';

export interface IdentityTelemetryPayload {
  event: IdentityTelemetryEvent;
  state: string;
  pathname: string;
  redirectDestination?: string | null;
  meta?: Record<string, string | number | boolean | null>;
  timestamp: string;
}

/**
 * Sampling control (production)
 * Default: 10% of events are logged
 */
const SAMPLE_RATE = 0.1;

function shouldSample(): boolean {
  return Math.random() < SAMPLE_RATE;
}

/**
 * Fire-and-forget telemetry emitter.
 * 
 * GUARANTEES:
 * - Never throws
 * - Never awaits
 * - Never blocks render
 * - Uses queueMicrotask for async execution
 */
export function emitIdentityTelemetry(payload: IdentityTelemetryPayload): void {
  try {
    // Skip if not sampled (90% of calls return immediately)
    if (!shouldSample()) return;

    // 🚫 NEVER await
    // 🚫 NEVER throw
    // 🚫 NEVER block render
    queueMicrotask(() => {
      try {
        // eslint-disable-next-line no-console
        logger.info('[IdentityTelemetry]', payload);

        // FUTURE EXPANSION:
        // navigator.sendBeacon('/api/telemetry', JSON.stringify(payload))
      } catch {
        // SILENT BY DESIGN — telemetry must never crash the app
      }
    });
  } catch {
    // SILENT BY DESIGN — outer catch for extra safety
  }
}
