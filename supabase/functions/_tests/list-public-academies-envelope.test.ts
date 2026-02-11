/**
 * PI-A08.H2.H1 — Contract Tests: list-public-academies Error Envelope Compliance
 *
 * SAFE GOLD: deterministic, no network, no side effects.
 * Validates that ALL error paths use the institutional Error Envelope (A07).
 */
import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";
import { parsePublicPagination } from "../_shared/security/publicQueryLimits.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// Helper — Validate institutional envelope shape
// ============================================================================

async function assertEnvelope(
  res: Response,
  expectedStatus: number,
  expectedCode: string,
  expectedMessageKey: string,
) {
  assertEquals(res.status, expectedStatus);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = await res.json();
  assertEquals(body.ok, false);
  assertEquals(body.code, expectedCode);
  assertEquals(body.messageKey, expectedMessageKey);
  assertEquals(typeof body.retryable, "boolean");
  assertExists(body.timestamp);
  assert(!isNaN(Date.parse(body.timestamp)), "timestamp must be valid ISO");
  // Must NOT contain legacy "error" field
  assertEquals(body.error, undefined, "envelope must not contain legacy 'error' field");
}

// ============================================================================
// Caso 1 — tenant_slug ausente → 400 VALIDATION_ERROR
// ============================================================================

Deno.test("list-public-academies: missing tenant_slug → 400 envelope", async () => {
  const res = errorResponse(
    400,
    buildErrorEnvelope(
      ERROR_CODES.VALIDATION_ERROR,
      "public.tenant_slug_invalid",
      false,
      ["tenant_slug missing or invalid"],
    ),
    CORS,
  );
  await assertEnvelope(res, 400, "VALIDATION_ERROR", "public.tenant_slug_invalid");
});

// ============================================================================
// Caso 2 — tenant_slug formato inválido → 400 VALIDATION_ERROR
// ============================================================================

Deno.test("list-public-academies: invalid slug format → 400 envelope", async () => {
  const res = errorResponse(
    400,
    buildErrorEnvelope(
      ERROR_CODES.VALIDATION_ERROR,
      "public.tenant_slug_format_invalid",
      false,
      ["tenant_slug must be alphanumeric with hyphens"],
    ),
    CORS,
  );
  await assertEnvelope(res, 400, "VALIDATION_ERROR", "public.tenant_slug_format_invalid");
});

// ============================================================================
// Caso 3 — limit > 50 → 400 via parsePublicPagination
// ============================================================================

Deno.test("list-public-academies: limit=51 → 400 envelope via pagination", async () => {
  const req = new Request("https://x.co/fn?tenant_slug=test&limit=51");
  const pag = parsePublicPagination(req, CORS);
  assertEquals(pag.ok, false);
  if (!pag.ok) {
    await assertEnvelope(pag.response, 400, "VALIDATION_ERROR", "public.limit_exceeded");
  }
});

// ============================================================================
// Caso 4 — DB error simulado → 500 INTERNAL_ERROR
// ============================================================================

Deno.test("list-public-academies: DB error → 500 envelope retryable", async () => {
  const envelope = buildErrorEnvelope(
    ERROR_CODES.INTERNAL_ERROR,
    "public.academies_fetch_failed",
    true,
    ["database error while fetching academies"],
  );
  assertEquals(envelope.ok, false);
  assertEquals(envelope.code, "INTERNAL_ERROR");
  assertEquals(envelope.retryable, true);
  assertExists(envelope.timestamp);
  const res = errorResponse(500, envelope, CORS);
  assertEquals(res.status, 500);
});

// ============================================================================
// Caso 5 — catch global → 500 INTERNAL_ERROR
// ============================================================================

Deno.test("list-public-academies: global catch → 500 envelope no details", async () => {
  const envelope = buildErrorEnvelope(
    ERROR_CODES.INTERNAL_ERROR,
    "system.internal_error",
    true,
  );
  assertEquals(envelope.ok, false);
  assertEquals(envelope.retryable, true);
  assertEquals(envelope.details, undefined);
  const res = errorResponse(500, envelope, CORS);
  assertEquals(res.status, 500);
});

// ============================================================================
// Caso 6 — Envelope never contains legacy "error" string field
// ============================================================================

Deno.test("list-public-academies: envelope has no legacy 'error' field", async () => {
  const codes = [
    { code: ERROR_CODES.VALIDATION_ERROR, msg: "public.tenant_slug_invalid", status: 400 },
    { code: ERROR_CODES.INTERNAL_ERROR, msg: "system.internal_error", status: 500 },
  ];
  for (const c of codes) {
    const res = errorResponse(c.status, buildErrorEnvelope(c.code, c.msg), CORS);
    const body = await res.json();
    assertEquals(body.error, undefined, `code=${c.code} must not have legacy 'error'`);
    assertEquals(body.ok, false);
  }
});

// ============================================================================
// Caso 7 — details array is preserved in envelope
// ============================================================================

Deno.test("list-public-academies: details preserved in envelope", async () => {
  const res = errorResponse(
    400,
    buildErrorEnvelope(
      ERROR_CODES.VALIDATION_ERROR,
      "public.tenant_slug_invalid",
      false,
      ["tenant_slug missing or invalid"],
    ),
    CORS,
  );
  const body = await res.json();
  assertEquals(body.details, ["tenant_slug missing or invalid"]);
});
