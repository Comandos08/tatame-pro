/**
 * P1.3 — sanitizeAuditMetadata Tests (Deno)
 *
 * Validates that the audit metadata sanitizer masks known PII keys
 * before an audit log row is written.
 *
 * Run: deno test --allow-env --allow-net supabase/functions/_tests/sanitize-audit-metadata.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";

import {
  maskEmail,
  maskName,
  sanitizeAuditMetadata,
} from "../_shared/security/sanitizeAuditMetadata.ts";

// ============================================================================
// maskEmail
// ============================================================================

Deno.test("maskEmail: preserves domain, masks local after 2 chars", () => {
  assertEquals(maskEmail("john.doe@example.com"), "jo***@example.com");
});

Deno.test("maskEmail: short local is fully masked", () => {
  assertEquals(maskEmail("ab@example.com"), "***@example.com");
});

Deno.test("maskEmail: returns *** for invalid input", () => {
  assertEquals(maskEmail(""), "***");
  assertEquals(maskEmail("not-an-email"), "***");
});

// ============================================================================
// maskName
// ============================================================================

Deno.test("maskName: multi-word keeps first name + initial", () => {
  assertEquals(maskName("João Silva Santos"), "João S.");
});

Deno.test("maskName: single word masks tail", () => {
  assertEquals(maskName("João"), "J***");
});

Deno.test("maskName: empty input returns ***", () => {
  assertEquals(maskName(""), "***");
});

// ============================================================================
// sanitizeAuditMetadata — flat
// ============================================================================

Deno.test("sanitizeAuditMetadata: masks known PII keys", () => {
  const input = {
    email: "user@example.com",
    full_name: "Jane Doe",
    athlete_id: "11111111-1111-1111-1111-111111111111",
  };
  const out = sanitizeAuditMetadata(input);
  assertEquals(out.email, "us***@example.com");
  assertEquals(out.full_name, "Jane D.");
  // Non-PII UUIDs should pass through untouched
  assertEquals(out.athlete_id, "11111111-1111-1111-1111-111111111111");
});

Deno.test("sanitizeAuditMetadata: key matching is case-insensitive", () => {
  const out = sanitizeAuditMetadata({ Email: "user@example.com", FULL_NAME: "Jane Doe" });
  assertEquals(out.Email, "us***@example.com");
  assertEquals(out.FULL_NAME, "Jane D.");
});

Deno.test("sanitizeAuditMetadata: non-PII keys pass through untouched", () => {
  const input = {
    tenant_id: "t-1",
    amount_cents: 1000,
    automatic: true,
    reason: "user_request",
  };
  const out = sanitizeAuditMetadata(input);
  assertEquals(out, input);
});

Deno.test("sanitizeAuditMetadata: null/undefined values preserved", () => {
  const out = sanitizeAuditMetadata({ reason: null, note: undefined });
  assertEquals(out.reason, null);
  assertEquals(out.note, undefined);
});

// ============================================================================
// sanitizeAuditMetadata — nested
// ============================================================================

Deno.test("sanitizeAuditMetadata: recurses into nested objects", () => {
  const input = {
    actor: {
      email: "admin@example.com",
      full_name: "Alice Bob",
    },
    tenant_id: "t-1",
  };
  const out = sanitizeAuditMetadata(input) as Record<string, unknown>;
  const actor = out.actor as Record<string, unknown>;
  assertEquals(actor.email, "ad***@example.com");
  assertEquals(actor.full_name, "Alice B.");
  assertEquals(out.tenant_id, "t-1");
});

Deno.test("sanitizeAuditMetadata: arrays are not recursed (pass-through)", () => {
  // Current contract: only plain objects recurse. Arrays pass through as-is.
  const input = {
    emails: ["user@example.com", "admin@example.com"],
  };
  const out = sanitizeAuditMetadata(input);
  assertEquals(out.emails, ["user@example.com", "admin@example.com"]);
});

// ============================================================================
// sanitizeAuditMetadata — edge cases
// ============================================================================

Deno.test("sanitizeAuditMetadata: empty object returns empty object", () => {
  assertEquals(sanitizeAuditMetadata({}), {});
});

Deno.test("sanitizeAuditMetadata: known PII aliases are all masked", () => {
  const out = sanitizeAuditMetadata({
    user_email: "a@b.com",
    athlete_email: "c@d.com",
    applicant_email: "e@f.com",
    athlete_name: "Full Name",
    user_name: "Other Name",
    applicant_name: "Third Name",
    display_name: "Fourth Name",
  });
  assertEquals(out.user_email, "***@b.com");
  assertEquals(out.athlete_email, "***@d.com");
  assertEquals(out.applicant_email, "***@f.com");
  assertEquals(out.athlete_name, "Full N.");
  assertEquals(out.user_name, "Other N.");
  assertEquals(out.applicant_name, "Third N.");
  assertEquals(out.display_name, "Fourth N.");
});
