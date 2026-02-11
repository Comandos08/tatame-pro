/**
 * PI-A08.H2 — Contract Tests for Public Pagination Limits
 *
 * SAFE GOLD: deterministic, no side effects, no network.
 * Validates anti-enumeration enforcement invariants.
 */
import {
  assertEquals,
  assertExists,
  assert,
  assertNotStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parsePublicPagination,
  validatePublicLimit,
} from "../_shared/security/publicQueryLimits.ts";

// ============================================================================
// Helper to build a mock Request with query params
// ============================================================================

function mockReq(params: Record<string, string> = {}): Request {
  const url = new URL("https://example.com/test");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

const CORS = { "Access-Control-Allow-Origin": "*" };

// ============================================================================
// validatePublicLimit — Unit tests
// ============================================================================

Deno.test("validatePublicLimit: valid limit", () => {
  assertEquals(validatePublicLimit(10).valid, true);
  assertEquals(validatePublicLimit(50).valid, true);
  assertEquals(validatePublicLimit(1).valid, true);
});

Deno.test("validatePublicLimit: limit > max", () => {
  const r = validatePublicLimit(51);
  assertEquals(r.valid, false);
  if (!r.valid) assertEquals(r.messageKey, "public.limit_exceeded");
});

Deno.test("validatePublicLimit: limit = 0", () => {
  const r = validatePublicLimit(0);
  assertEquals(r.valid, false);
  if (!r.valid) assertEquals(r.messageKey, "public.limit_invalid");
});

Deno.test("validatePublicLimit: limit = -1", () => {
  const r = validatePublicLimit(-1);
  assertEquals(r.valid, false);
  if (!r.valid) assertEquals(r.messageKey, "public.limit_invalid");
});

// ============================================================================
// parsePublicPagination — Default limit when missing
// ============================================================================

Deno.test("parsePublicPagination: default limit=50 offset=0 when no params", () => {
  const result = parsePublicPagination(mockReq(), CORS);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.limit, 50);
    assertEquals(result.offset, 0);
  }
});

// ============================================================================
// parsePublicPagination — Valid combinations
// ============================================================================

Deno.test("parsePublicPagination: limit=10 offset=0 ok", () => {
  const result = parsePublicPagination(mockReq({ limit: "10", offset: "0" }), CORS);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.limit, 10);
    assertEquals(result.offset, 0);
  }
});

Deno.test("parsePublicPagination: limit=50 ok", () => {
  const result = parsePublicPagination(mockReq({ limit: "50" }), CORS);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.limit, 50);
});

// ============================================================================
// parsePublicPagination — Rejections (400 Envelope)
// ============================================================================

Deno.test("parsePublicPagination: limit=51 returns 400 envelope", async () => {
  const result = parsePublicPagination(mockReq({ limit: "51" }), CORS);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.response.status, 400);
    const body = await result.response.json();
    assertEquals(body.ok, false);
    assertEquals(body.code, "VALIDATION_ERROR");
    assertEquals(body.messageKey, "public.limit_exceeded");
    assertExists(body.timestamp);
  }
});

Deno.test("parsePublicPagination: limit=0 returns 400", async () => {
  const result = parsePublicPagination(mockReq({ limit: "0" }), CORS);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.response.status, 400);
    const body = await result.response.json();
    assertEquals(body.code, "VALIDATION_ERROR");
    assertEquals(body.messageKey, "public.limit_invalid");
  }
});

Deno.test("parsePublicPagination: limit=-1 returns 400", async () => {
  const result = parsePublicPagination(mockReq({ limit: "-1" }), CORS);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.response.status, 400);
    const body = await result.response.json();
    assertEquals(body.messageKey, "public.limit_invalid");
  }
});

// ============================================================================
// parsePublicPagination — Negative offset normalized to 0
// ============================================================================

Deno.test("parsePublicPagination: offset=-1 normalized to 0", () => {
  const result = parsePublicPagination(mockReq({ limit: "10", offset: "-1" }), CORS);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.offset, 0);
    assertEquals(result.limit, 10);
  }
});

// ============================================================================
// parsePublicPagination — page/perPage mode
// ============================================================================

Deno.test("parsePublicPagination: page=1 perPage=20 => offset=0 limit=20", () => {
  const result = parsePublicPagination(mockReq({ page: "1", perPage: "20" }), CORS);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.offset, 0);
    assertEquals(result.limit, 20);
  }
});

Deno.test("parsePublicPagination: page=2 perPage=20 => offset=20 limit=20", () => {
  const result = parsePublicPagination(mockReq({ page: "2", perPage: "20" }), CORS);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.offset, 20);
    assertEquals(result.limit, 20);
  }
});

Deno.test("parsePublicPagination: perPage>50 returns 400 limit_exceeded", async () => {
  const result = parsePublicPagination(mockReq({ page: "1", perPage: "51" }), CORS);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.response.status, 400);
    const body = await result.response.json();
    assertEquals(body.code, "VALIDATION_ERROR");
    assertEquals(body.messageKey, "public.limit_exceeded");
  }
});
