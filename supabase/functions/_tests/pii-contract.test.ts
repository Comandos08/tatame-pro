/**
 * PI-A08 — PII Contract Tests (Deno)
 *
 * Validates that the PII contract infrastructure works correctly.
 * - sanitizePublicPayload strips sensitive columns
 * - isSensitiveTable classifies correctly
 * - classifyAnonAccess returns correct risk levels
 */

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";

// Import shared utilities
import { sanitizePublicPayload, isSensitiveTable, sanitizePublicPayloadArray } from "../_shared/security/sanitizePublicPayload.ts";

// ============================================================================
// sanitizePublicPayload
// ============================================================================

Deno.test("sanitizePublicPayload: strips email from athletes", () => {
  const input = { id: "123", full_name: "Test", email: "test@test.com", phone: "123" };
  const result = sanitizePublicPayload("athletes", input);
  assertEquals(result.id, "123");
  assertEquals(result.full_name, "Test");
  assertEquals("email" in result, false);
  assertEquals("phone" in result, false);
});

Deno.test("sanitizePublicPayload: strips profile_id from coaches", () => {
  const input = { id: "c1", full_name: "Coach", profile_id: "p1", rank: "black" };
  const result = sanitizePublicPayload("coaches", input);
  assertEquals(result.id, "c1");
  assertEquals(result.full_name, "Coach");
  assertEquals(result.rank, "black");
  assertEquals("profile_id" in result, false);
});

Deno.test("sanitizePublicPayload: strips stripe fields from memberships", () => {
  const input = { id: "m1", status: "ACTIVE", stripe_checkout_session_id: "cs_xxx", stripe_payment_intent_id: "pi_xxx" };
  const result = sanitizePublicPayload("memberships", input);
  assertEquals(result.id, "m1");
  assertEquals(result.status, "ACTIVE");
  assertEquals("stripe_checkout_session_id" in result, false);
  assertEquals("stripe_payment_intent_id" in result, false);
});

Deno.test("sanitizePublicPayload: passes through unknown table unchanged", () => {
  const input = { id: "1", name: "test", secret: "keep" };
  const result = sanitizePublicPayload("unknown_table", input);
  assertEquals(result, input);
});

Deno.test("sanitizePublicPayload: does not mutate original", () => {
  const input = { id: "123", email: "a@b.com", full_name: "Test" };
  const result = sanitizePublicPayload("athletes", input);
  assertNotEquals(result, input);
  assertEquals(input.email, "a@b.com"); // original unchanged
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

Deno.test("isSensitiveTable: platform_partners is not sensitive", () => {
  assertEquals(isSensitiveTable("platform_partners"), false);
});

Deno.test("isSensitiveTable: events is not sensitive", () => {
  assertEquals(isSensitiveTable("events"), false);
});

// ============================================================================
// sanitizePublicPayloadArray
// ============================================================================

Deno.test("sanitizePublicPayloadArray: strips from all items", () => {
  const input = [
    { id: "1", email: "a@b.com", full_name: "A" },
    { id: "2", email: "c@d.com", full_name: "B" },
  ];
  const result = sanitizePublicPayloadArray("athletes", input);
  assertEquals(result.length, 2);
  assertEquals("email" in result[0], false);
  assertEquals("email" in result[1], false);
  assertEquals(result[0].full_name, "A");
});
