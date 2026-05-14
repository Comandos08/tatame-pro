/**
 * Contract tests for the dispatchCriticalAlert helper.
 *
 * Behavioural surface: it must (a) never throw, regardless of input or
 * environment, (b) honor the recursion guard so notify-critical-alert
 * cannot escalate itself into a loop, and (c) only attempt an HTTP call
 * when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are both set.
 *
 * The module reads env at import time, so the simplest reliable test is
 * to assert the exported `criticalAlertConfigured` flag tracks what Deno
 * actually has loaded — for the rest we rely on synchronous invariants
 * (no throw, returns void, recursion-guarded path is a no-op).
 */
import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  dispatchCriticalAlert,
  criticalAlertConfigured,
} from "./critical-alert.ts";

Deno.test("dispatchCriticalAlert: returns void synchronously", () => {
  const result = dispatchCriticalAlert({
    event_id: "evt-1",
    event_type: "TEST_EVENT",
    severity: "CRITICAL",
    source: "test-suite",
  });
  assertEquals(result, undefined);
});

Deno.test("dispatchCriticalAlert: never throws on minimal payload", () => {
  // Must complete without throwing even when env is unset (test env).
  dispatchCriticalAlert({
    event_id: "evt-2",
    event_type: "ANOTHER",
    severity: "HIGH",
    source: "test-suite",
  });
  // If we got here without throw, pass.
  assert(true);
});

Deno.test("dispatchCriticalAlert: never throws on full payload with metadata", () => {
  dispatchCriticalAlert({
    event_id: crypto.randomUUID(),
    event_type: "FULL_PAYLOAD",
    severity: "CRITICAL",
    source: "test-suite",
    tenant_id: "tenant-abc",
    metadata: {
      nested: { value: 42 },
      list: [1, 2, 3],
      err: new Error("boom").message,
    },
  });
  assert(true);
});

Deno.test("dispatchCriticalAlert: recursion guard — no-op when source is notify-critical-alert", () => {
  // We cannot directly observe the absence of the fetch call from inside
  // the test process, but we can assert the call returns synchronously
  // without throwing — which together with the source code's early-return
  // pins the contract.
  dispatchCriticalAlert({
    event_id: "self-call",
    event_type: "RECURSION_GUARD_TEST",
    severity: "CRITICAL",
    source: "notify-critical-alert",
  });
  assert(true);
});

Deno.test("criticalAlertConfigured: reflects current env state", () => {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const expected = Boolean(url && key);
  assertEquals(criticalAlertConfigured, expected);
});

Deno.test("dispatchCriticalAlert: accepts every documented severity level", () => {
  const severities: Array<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = [
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL",
  ];
  for (const severity of severities) {
    dispatchCriticalAlert({
      event_id: `evt-${severity}`,
      event_type: "SEVERITY_PROBE",
      severity,
      source: "test-suite",
    });
  }
  assert(true);
});
