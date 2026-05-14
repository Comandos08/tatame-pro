/**
 * Fire-and-forget dispatcher for the `notify-critical-alert` Edge Function.
 *
 * Centralizes the "call my own infra to escalate this incident" pattern that
 * already exists ad-hoc in stripe-webhook (callEdgeFunctionWithRetry). The
 * goal is to make `log.critical(...)` from any Edge Function cause an
 * institutional event, a Slack message (if SLACK_WEBHOOK_URL is set), and an
 * admin email (if ALERT_EMAIL_ENABLED) without the call site having to know
 * any of that — and without the call site EVER hanging on or being broken by
 * a Slack/email outage.
 *
 * Recursion guard: the dispatcher does nothing when invoked from
 * `notify-critical-alert` itself, so a critical log inside that function
 * cannot cause an infinite escalation loop.
 *
 * Configuration: requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be
 * set in Function Secrets. Both already exist for every other function;
 * no new operator setup needed beyond what notify-critical-alert already
 * documents (SLACK_WEBHOOK_URL, ADMIN_ALERT_EMAIL, etc.).
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const isConfigured = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

export interface CriticalAlertPayload {
  /** Stable identifier — used by the receiver for dedupe and for audit
   *  trails. Generate one if you do not have a natural ID. */
  event_id: string;
  /** Short SCREAMING_SNAKE_CASE label, e.g. "BILLING_CONSISTENCY_MISMATCH". */
  event_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  tenant_id?: string | null;
  /** Free-form context. Will be JSON-serialized into the alert. */
  metadata?: Record<string, unknown>;
  /** Calling function name. Used for the recursion guard and tagging. */
  source: string;
}

/**
 * Fire-and-forget critical alert. Never throws. Returns immediately when:
 *   - Required env vars are missing (CI / dev / preview environments)
 *   - The caller is `notify-critical-alert` itself (recursion guard)
 */
export function dispatchCriticalAlert(payload: CriticalAlertPayload): void {
  if (!isConfigured) return;
  if (payload.source === "notify-critical-alert") return; // recursion guard

  // Fire-and-forget. We intentionally do not await — the call site is usually
  // in a request hot-path or a tear-down branch, and a slow webhook must
  // never delay the response back to the client. The Edge Function runtime
  // will let the promise complete in the background; the worst case is a
  // dropped event, never a delayed user-facing response.
  void send(payload).catch(() => { /* swallow */ });
}

async function send(payload: CriticalAlertPayload): Promise<void> {
  const url = `${SUPABASE_URL}/functions/v1/notify-critical-alert`;
  const body = JSON.stringify({
    event_id: payload.event_id,
    event_type: payload.event_type,
    severity: payload.severity,
    tenant_id: payload.tenant_id ?? undefined,
    metadata: {
      source: payload.source,
      ...(payload.metadata ?? {}),
    },
    timestamp: new Date().toISOString(),
  });

  // 3s timeout — Slack and Resend are both well under a second in the happy
  // path; anything longer is a sign the alert path is degraded and should
  // not block.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Test/introspection helper. */
export const criticalAlertConfigured = isConfigured;
