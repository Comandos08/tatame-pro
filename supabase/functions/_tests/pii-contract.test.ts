/**
 * PI-A08.H1 — PII Contract Tests (Deno) — FAIL-CLOSED
 *
 * Validates that the PII contract infrastructure works correctly.
 * - sanitizePublicPayload THROWS for non-public tables
 * - sanitizePublicPayload strips sensitive columns for public-safe tables
 * - isSensitiveTable classifies correctly
 * - sanitizePublicPayloadArray applies to all items
 */

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";

import {
  sanitizePublicPayload,
  isSensitiveTable,
  sanitizePublicPayloadArray,
} from "../_shared/security/sanitizePublicPayload.ts";

// ============================================================================
// FAIL-CLOSED: throws for non-public tables
// ============================================================================

Deno.test("sanitizePublicPayload: throws for non-public table (athletes)", () => {
  const input = { id: "1", email: "a@b.com" };
  let threw = false;
  try {
    sanitizePublicPayload("athletes", input);
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message, "PII_CONTRACT_VIOLATION:athletes");
  }
  assertEquals(threw, true);
});

Deno.test("sanitizePublicPayload: throws for non-public table (profiles)", () => {
  const input = { id: "1", email: "a@b.com" };
  let threw = false;
  try {
    sanitizePublicPayload("profiles", input);
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message, "PII_CONTRACT_VIOLATION:profiles");
  }
  assertEquals(threw, true);
});

Deno.test("sanitizePublicPayload: throws for unknown table", () => {
  const input = { id: "1", name: "test" };
  let threw = false;
  try {
    sanitizePublicPayload("unknown_table", input);
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message, "PII_CONTRACT_VIOLATION:unknown_table");
  }
  assertEquals(threw, true);
});

// ============================================================================
// PUBLIC-SAFE tables: returns copy without mutation
// ============================================================================

Deno.test("sanitizePublicPayload: public-safe table returns copy (platform_partners)", () => {
  const input = { id: "1", name: "Partner X" };
  const out = sanitizePublicPayload("platform_partners", input);
  // Returns equal content but different reference (copy)
  assertNotEquals(out === input, true);
  assertEquals(out.id, input.id);
  assertEquals(out.name, input.name);
});

Deno.test("sanitizePublicPayload: public-safe table returns copy (feature_access)", () => {
  const input = { id: "fa1", feature_key: "dashboard", is_active: true };
  const out = sanitizePublicPayload("feature_access", input);
  assertNotEquals(out === input, true);
  assertEquals(out.feature_key, "dashboard");
  assertEquals(out.is_active, true);
});

Deno.test("sanitizePublicPayload: does not mutate original on public-safe table", () => {
  const input = { id: "1", name: "X", extra: "keep" };
  const out = sanitizePublicPayload("billing_environment_config", input);
  assertEquals(input.extra, "keep");
  assertEquals(out.extra, "keep");
});

// ============================================================================
// isSensitiveTable
// ============================================================================

Deno.test("isSensitiveTable: profiles is sensitive", () => {
  assertEquals(isSensitiveTable("profiles"), true);
});

Deno.test("isSensitiveTable: athletes is sensitive", () => {
  assertEquals(isSensitiveTable("athletes"), true);
});

Deno.test("isSensitiveTable: audit_logs is sensitive (extra, no columns)", () => {
  assertEquals(isSensitiveTable("audit_logs"), true);
});

Deno.test("isSensitiveTable: platform_partners is not sensitive", () => {
  assertEquals(isSensitiveTable("platform_partners"), false);
});

Deno.test("isSensitiveTable: events is not sensitive", () => {
  assertEquals(isSensitiveTable("events"), false);
});

// ============================================================================
// sanitizePublicPayloadArray
// ============================================================================

Deno.test("sanitizePublicPayloadArray: works on public-safe tables", () => {
  const input = [
    { id: "1", name: "A" },
    { id: "2", name: "B" },
  ];
  const result = sanitizePublicPayloadArray("platform_partners", input);
  assertEquals(result.length, 2);
  assertEquals(result[0].name, "A");
  assertEquals(result[1].name, "B");
});

Deno.test("sanitizePublicPayloadArray: throws for non-public table", () => {
  const input = [{ id: "1", email: "a@b.com" }];
  let threw = false;
  try {
    sanitizePublicPayloadArray("athletes", input);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
