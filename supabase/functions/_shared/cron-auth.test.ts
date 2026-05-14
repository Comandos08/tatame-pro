/**
 * Contract tests for requireCronSecret.
 *
 * Three branches matter and each is exercised below:
 *   - CRON_SECRET env var unset  → 500 INTERNAL_ERROR envelope
 *   - x-cron-secret missing/wrong → 403 FORBIDDEN envelope
 *   - both present and matching   → null (caller proceeds)
 *
 * The body shape is asserted because the helper is the new canonical path
 * for the eleven scheduled Edge Functions — any drift in the envelope keys
 * would silently invalidate downstream log parsers and dashboards that
 * already filter on { code: "FORBIDDEN", messageKey: "auth.cron_secret_invalid" }.
 */
import {
  assertEquals,
  assert,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireCronSecret } from "./cron-auth.ts";
import { createBackendLogger } from "./backend-logger.ts";

const cors = { "Access-Control-Allow-Origin": "*" } as Record<string, string>;
const correlationId = "test-corr-id";

function makeLog() {
  return createBackendLogger("test-runner", correlationId);
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/", { headers });
}

// ============================================================================
// Path A — CRON_SECRET env unset
// ============================================================================

Deno.test("requireCronSecret: returns 500 INTERNAL_ERROR when CRON_SECRET unset", async () => {
  const previous = Deno.env.get("CRON_SECRET");
  Deno.env.delete("CRON_SECRET");
  try {
    const result = requireCronSecret(makeRequest(), cors, makeLog(), correlationId);
    assertExists(result);
    assertEquals(result.status, 500);
    const body = await result.json();
    assertEquals(body.ok, false);
    assertEquals(body.code, "INTERNAL_ERROR");
    assertEquals(body.messageKey, "system.cron_secret_missing");
    assertEquals(body.correlationId, correlationId);
  } finally {
    if (previous !== undefined) Deno.env.set("CRON_SECRET", previous);
  }
});

// ============================================================================
// Path B — header missing / wrong
// ============================================================================

Deno.test("requireCronSecret: returns 403 FORBIDDEN when x-cron-secret header is missing", async () => {
  Deno.env.set("CRON_SECRET", "the-real-secret");
  try {
    const result = requireCronSecret(makeRequest(), cors, makeLog(), correlationId);
    assertExists(result);
    assertEquals(result.status, 403);
    const body = await result.json();
    assertEquals(body.ok, false);
    assertEquals(body.code, "FORBIDDEN");
    assertEquals(body.messageKey, "auth.cron_secret_invalid");
  } finally {
    Deno.env.delete("CRON_SECRET");
  }
});

Deno.test("requireCronSecret: returns 403 when header is present but does not match", async () => {
  Deno.env.set("CRON_SECRET", "the-real-secret");
  try {
    const req = makeRequest({ "x-cron-secret": "the-wrong-secret" });
    const result = requireCronSecret(req, cors, makeLog(), correlationId);
    assertExists(result);
    assertEquals(result.status, 403);
  } finally {
    Deno.env.delete("CRON_SECRET");
  }
});

Deno.test("requireCronSecret: empty string header counts as missing", async () => {
  Deno.env.set("CRON_SECRET", "the-real-secret");
  try {
    const req = makeRequest({ "x-cron-secret": "" });
    const result = requireCronSecret(req, cors, makeLog(), correlationId);
    assertExists(result);
    assertEquals(result.status, 403);
  } finally {
    Deno.env.delete("CRON_SECRET");
  }
});

// ============================================================================
// Path C — happy path
// ============================================================================

Deno.test("requireCronSecret: returns null when secret matches exactly", () => {
  Deno.env.set("CRON_SECRET", "match-me");
  try {
    const req = makeRequest({ "x-cron-secret": "match-me" });
    const result = requireCronSecret(req, cors, makeLog(), correlationId);
    assertEquals(result, null);
  } finally {
    Deno.env.delete("CRON_SECRET");
  }
});

Deno.test("requireCronSecret: comparison is exact (case-sensitive)", async () => {
  Deno.env.set("CRON_SECRET", "Aa1!");
  try {
    const wrong = requireCronSecret(
      makeRequest({ "x-cron-secret": "aa1!" }),
      cors,
      makeLog(),
      correlationId,
    );
    assertExists(wrong);
    assertEquals(wrong.status, 403);

    const right = requireCronSecret(
      makeRequest({ "x-cron-secret": "Aa1!" }),
      cors,
      makeLog(),
      correlationId,
    );
    assertEquals(right, null);
  } finally {
    Deno.env.delete("CRON_SECRET");
  }
});

// ============================================================================
// Envelope structure invariants
// ============================================================================

Deno.test("requireCronSecret: error envelopes carry timestamp, ok=false, and retryable=false", async () => {
  Deno.env.set("CRON_SECRET", "x");
  try {
    const result = requireCronSecret(makeRequest(), cors, makeLog(), correlationId);
    assertExists(result);
    const body = await result.json();
    assertEquals(body.ok, false);
    assertEquals(body.retryable, false);
    assert(typeof body.timestamp === "string");
    assert(body.timestamp.length > 0);
  } finally {
    Deno.env.delete("CRON_SECRET");
  }
});

Deno.test("requireCronSecret: includes CORS headers in the rejection response", () => {
  Deno.env.set("CRON_SECRET", "x");
  try {
    const customCors = {
      "Access-Control-Allow-Origin": "https://tatame.pro",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
    const result = requireCronSecret(makeRequest(), customCors, makeLog(), correlationId);
    assertExists(result);
    assertEquals(
      result.headers.get("Access-Control-Allow-Origin"),
      "https://tatame.pro",
    );
    assertEquals(
      result.headers.get("Access-Control-Allow-Methods"),
      "POST, OPTIONS",
    );
    assertEquals(result.headers.get("Content-Type"), "application/json");
  } finally {
    Deno.env.delete("CRON_SECRET");
  }
});
