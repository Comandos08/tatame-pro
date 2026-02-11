/**
 * PI-A08.H2.H2 — Integration Contract Test: list-public-academies
 *
 * Tests the REAL handler (not just helpers) to guarantee:
 * - All 4xx/5xx use the institutional Error Envelope (A07)
 * - No legacy { error: "..." } ever leaks
 * - Contract is immutable over time
 */
import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler } from "../list-public-academies/index.ts";

// ============================================================================
// Helper — Validate institutional envelope shape
// ============================================================================

async function assertEnvelope(
  res: Response,
  expectedStatus: number,
  expectedCode: string,
) {
  assertEquals(res.status, expectedStatus);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = await res.json();
  assertEquals(body.ok, false);
  assertEquals(body.code, expectedCode);
  assertEquals(typeof body.retryable, "boolean");
  assertExists(body.timestamp);
  assert(!isNaN(Date.parse(body.timestamp)), "timestamp must be valid ISO");
  assertEquals(body.error, undefined, "must not contain legacy 'error' field");
  return body;
}

// ============================================================================
// 1 — Missing tenant_slug → 400 VALIDATION_ERROR
// ============================================================================

Deno.test("integration: missing tenant_slug → 400 envelope", async () => {
  const req = new Request("https://x.co/functions/v1/list-public-academies");
  const res = await handler(req);
  const body = await assertEnvelope(res, 400, "VALIDATION_ERROR");
  assertEquals(body.messageKey, "public.tenant_slug_invalid");
});

// ============================================================================
// 2 — Invalid slug format → 400 VALIDATION_ERROR
// ============================================================================

Deno.test("integration: invalid slug format → 400 envelope", async () => {
  const req = new Request("https://x.co/functions/v1/list-public-academies?tenant_slug=!!!");
  const res = await handler(req);
  const body = await assertEnvelope(res, 400, "VALIDATION_ERROR");
  assertEquals(body.messageKey, "public.tenant_slug_format_invalid");
});

// ============================================================================
// 3 — limit > 50 → 400 VALIDATION_ERROR (via parsePublicPagination)
// ============================================================================

Deno.test("integration: limit > 50 → 400 envelope", async () => {
  const req = new Request("https://x.co/functions/v1/list-public-academies?tenant_slug=test&limit=51");
  const res = await handler(req);
  const body = await assertEnvelope(res, 400, "VALIDATION_ERROR");
  assertEquals(body.messageKey, "public.limit_exceeded");
});

// ============================================================================
// 4 — limit = 0 → 400 VALIDATION_ERROR
// ============================================================================

Deno.test("integration: limit=0 → 400 envelope", async () => {
  const req = new Request("https://x.co/functions/v1/list-public-academies?tenant_slug=test&limit=0");
  const res = await handler(req);
  const body = await assertEnvelope(res, 400, "VALIDATION_ERROR");
  assertEquals(body.messageKey, "public.limit_invalid");
});

// ============================================================================
// 5 — limit = -1 → 400 VALIDATION_ERROR
// ============================================================================

Deno.test("integration: limit=-1 → 400 envelope", async () => {
  const req = new Request("https://x.co/functions/v1/list-public-academies?tenant_slug=test&limit=-1");
  const res = await handler(req);
  const body = await assertEnvelope(res, 400, "VALIDATION_ERROR");
  assertEquals(body.messageKey, "public.limit_invalid");
});

// ============================================================================
// 6 — OPTIONS → 200 (CORS preflight untouched)
// ============================================================================

Deno.test("integration: OPTIONS → 200 CORS preflight", async () => {
  const req = new Request("https://x.co/functions/v1/list-public-academies", {
    method: "OPTIONS",
  });
  const res = await handler(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});
