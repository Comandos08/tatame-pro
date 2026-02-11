/**
 * PI-A07.H1 — Contract Tests for Institutional Error Envelope
 *
 * SAFE GOLD: deterministic, no side effects, no network.
 * Validates envelope invariants to prevent regression.
 */
import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  rpcErrorResponse,
  ERROR_CODES,
} from "./envelope.ts";

// ============================================================================
// buildErrorEnvelope — Invariants
// ============================================================================

Deno.test("buildErrorEnvelope: always returns ok === false", () => {
  const env = buildErrorEnvelope("TEST", "test.message");
  assertEquals(env.ok, false);
});

Deno.test("buildErrorEnvelope: code is preserved", () => {
  const env = buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.test");
  assertEquals(env.code, "UNAUTHORIZED");
});

Deno.test("buildErrorEnvelope: messageKey is preserved", () => {
  const env = buildErrorEnvelope("X", "some.key");
  assertEquals(env.messageKey, "some.key");
});

Deno.test("buildErrorEnvelope: retryable defaults to false", () => {
  const env = buildErrorEnvelope("X", "x");
  assertEquals(env.retryable, false);
});

Deno.test("buildErrorEnvelope: retryable can be set to true", () => {
  const env = buildErrorEnvelope("X", "x", true);
  assertEquals(env.retryable, true);
});

Deno.test("buildErrorEnvelope: timestamp is valid ISO string", () => {
  const env = buildErrorEnvelope("X", "x");
  assertExists(env.timestamp);
  const parsed = Date.parse(env.timestamp);
  assert(!isNaN(parsed), `timestamp "${env.timestamp}" is not a valid ISO date`);
});

Deno.test("buildErrorEnvelope: details omitted when empty", () => {
  const env = buildErrorEnvelope("X", "x", false, []);
  assertEquals(env.details, undefined);
});

Deno.test("buildErrorEnvelope: details included when provided", () => {
  const env = buildErrorEnvelope("X", "x", false, ["detail1"]);
  assertEquals(env.details, ["detail1"]);
});

// ============================================================================
// errorResponse — Response invariants
// ============================================================================

Deno.test("errorResponse: preserves HTTP status", async () => {
  const cors = { "Access-Control-Allow-Origin": "*" };
  const envelope = buildErrorEnvelope("TEST", "test.msg");
  const res = errorResponse(400, envelope, cors);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertExists(body.timestamp);
  assertEquals(body.ok, false);
});

Deno.test("errorResponse: content-type is application/json", async () => {
  const cors = {};
  const envelope = buildErrorEnvelope("X", "x");
  const res = errorResponse(500, envelope, cors);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  await res.text(); // consume body
});

// ============================================================================
// Convenience helpers — Response invariants
// ============================================================================

Deno.test("unauthorizedResponse: returns 401 with envelope", async () => {
  const res = unauthorizedResponse();
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.ok, false);
  assertEquals(body.code, "UNAUTHORIZED");
  assertExists(body.timestamp);
  assertEquals(body.retryable, false);
});

Deno.test("forbiddenResponse: returns 403 with envelope", async () => {
  const res = forbiddenResponse();
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.ok, false);
  assertEquals(body.code, "FORBIDDEN");
  assertExists(body.timestamp);
});

Deno.test("rpcErrorResponse: returns 500 with details", async () => {
  const res = rpcErrorResponse(undefined, "my_rpc", "timeout");
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.ok, false);
  assertEquals(body.code, "RPC_ERROR");
  assertEquals(body.details, ["my_rpc: timeout"]);
  assertExists(body.timestamp);
});

// ============================================================================
// ERROR_CODES — Completeness
// ============================================================================

Deno.test("ERROR_CODES: all canonical codes exist", () => {
  const required = [
    "UNAUTHORIZED", "FORBIDDEN", "VALIDATION_ERROR", "PAYLOAD_TOO_LARGE",
    "MALFORMED_JSON", "NOT_FOUND", "CONFLICT", "BILLING_BLOCKED",
    "TENANT_BLOCKED", "INTERNAL_ERROR", "RPC_ERROR", "RATE_LIMITED",
  ];
  for (const code of required) {
    assertExists(
      (ERROR_CODES as Record<string, string>)[code],
      `Missing ERROR_CODE: ${code}`,
    );
  }
});
