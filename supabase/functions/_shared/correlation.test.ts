/**
 * A02 — Correlation ID Extractor Tests (SAFE GOLD)
 *
 * Single function under test but the contract matters: every Edge Function
 * log line carries this ID, so a regression that breaks pass-through or
 * stops generating fallbacks would fragment cross-function tracing on day
 * one of incident response.
 */
import {
  assertEquals,
  assertMatch,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractCorrelationId } from "./correlation.ts";

// UUID v4 / v7 pattern. crypto.randomUUID() is spec'd to return v4 — we
// keep the regex slightly looser to allow runtime-version drift.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.test("extractCorrelationId: returns the header value verbatim when present", () => {
  const cid = "trace-abc-123";
  const req = new Request("http://localhost/", {
    headers: { "x-correlation-id": cid },
  });
  assertEquals(extractCorrelationId(req), cid);
});

Deno.test("extractCorrelationId: header lookup is case-insensitive (HTTP semantics)", () => {
  const cid = "MixedCaseHeader";
  const req = new Request("http://localhost/", {
    headers: { "X-Correlation-Id": cid },
  });
  assertEquals(extractCorrelationId(req), cid);
});

Deno.test("extractCorrelationId: generates a UUID when header is absent", () => {
  const req = new Request("http://localhost/");
  const cid = extractCorrelationId(req);
  assertMatch(cid, UUID_PATTERN);
});

Deno.test("extractCorrelationId: each fallback call yields a fresh UUID", () => {
  const req1 = new Request("http://localhost/");
  const req2 = new Request("http://localhost/");
  assertNotEquals(extractCorrelationId(req1), extractCorrelationId(req2));
});

Deno.test("extractCorrelationId: empty header value falls back to generated UUID", () => {
  // Per the implementation, "" is falsy and triggers the fallback branch.
  const req = new Request("http://localhost/", {
    headers: { "x-correlation-id": "" },
  });
  assertMatch(extractCorrelationId(req), UUID_PATTERN);
});

Deno.test("extractCorrelationId: preserves long opaque tokens unchanged", () => {
  const long = "abc.".repeat(32) + "end";
  const req = new Request("http://localhost/", {
    headers: { "x-correlation-id": long },
  });
  assertEquals(extractCorrelationId(req), long);
});
