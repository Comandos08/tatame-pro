/**
 * Contract tests for the institutional document validity rule (GOLDEN RULE).
 *
 * Every digital card and diploma renders its validity based on this single
 * function. A regression here either:
 *   - shows "VÁLIDA" on a card whose tenant is suspended (institutional
 *     trust violation), or
 *   - shows "INVÁLIDA" on a legitimately-active diploma (athlete cannot
 *     prove credentials).
 *
 * The function has four rules evaluated in order. Each rule produces a
 * different reason code; we pin the ORDER (so the most specific
 * actionable reason surfaces first) and each rule's predicate.
 */
import {
  assertEquals,
  assert,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isInstitutionalDocumentValid,
  isDocumentValid,
  type DocumentValidityInput,
} from "./isDocumentValid.ts";

// Fixture: every rule satisfied. Override per test.
function valid(overrides: Partial<DocumentValidityInput> = {}): DocumentValidityInput {
  return {
    tenantStatus: "ACTIVE",
    billingStatus: "ACTIVE",
    documentStatus: "ACTIVE",
    revokedAt: null,
    ...overrides,
  };
}

// =============================================================================
// Happy paths
// =============================================================================

Deno.test("isInstitutionalDocumentValid: all rules satisfied → valid, reason null", () => {
  const result = isInstitutionalDocumentValid(valid());
  assertEquals(result, { isValid: true, reason: null });
});

Deno.test("isInstitutionalDocumentValid: ACTIVE tenant + TRIALING billing + ACTIVE document → valid", () => {
  const result = isInstitutionalDocumentValid(valid({ billingStatus: "TRIALING" }));
  assertEquals(result.isValid, true);
});

Deno.test("isInstitutionalDocumentValid: ISSUED document status (diplomas) → valid", () => {
  const result = isInstitutionalDocumentValid(valid({ documentStatus: "ISSUED" }));
  assertEquals(result.isValid, true);
});

Deno.test("isInstitutionalDocumentValid: revokedAt explicitly null → valid", () => {
  const result = isInstitutionalDocumentValid(valid({ revokedAt: null }));
  assertEquals(result.isValid, true);
});

Deno.test("isInstitutionalDocumentValid: revokedAt undefined (column not present) → valid", () => {
  // The DocumentValidityInput interface allows revokedAt to be optional.
  // Pass an object without the field at all.
  const result = isInstitutionalDocumentValid({
    tenantStatus: "ACTIVE",
    billingStatus: "ACTIVE",
    documentStatus: "ACTIVE",
  });
  assertEquals(result.isValid, true);
});

// =============================================================================
// Rule 1 — Tenant must be ACTIVE
// =============================================================================

const NON_ACTIVE_TENANT_STATUSES = ["SETUP", "BLOCKED", "TERMINATED", "PENDING_DELETE", ""];

for (const status of NON_ACTIVE_TENANT_STATUSES) {
  Deno.test(`isInstitutionalDocumentValid: tenantStatus=${status || "<empty>"} → invalid, reason TENANT_NOT_ACTIVE`, () => {
    const result = isInstitutionalDocumentValid(valid({ tenantStatus: status }));
    assertEquals(result.isValid, false);
    assertEquals(result.reason, "TENANT_NOT_ACTIVE");
  });
}

// =============================================================================
// Rule 2 — Billing must be ACTIVE or TRIALING
// =============================================================================

const INVALID_BILLING_STATUSES = [
  "TRIAL_EXPIRED",
  "PENDING_DELETE",
  "PAST_DUE",
  "CANCELED",
  "UNPAID",
  "INCOMPLETE",
  "",
];

for (const status of INVALID_BILLING_STATUSES) {
  Deno.test(`isInstitutionalDocumentValid: billingStatus=${status || "<empty>"} → invalid, reason BILLING_INVALID`, () => {
    const result = isInstitutionalDocumentValid(valid({ billingStatus: status }));
    assertEquals(result.isValid, false);
    assertEquals(result.reason, "BILLING_INVALID");
  });
}

// =============================================================================
// Rule 3 — Document status must be ACTIVE or ISSUED
// =============================================================================

const INVALID_DOC_STATUSES = ["DRAFT", "SUSPENDED", "EXPIRED", "REVOKED", ""];

for (const status of INVALID_DOC_STATUSES) {
  Deno.test(`isInstitutionalDocumentValid: documentStatus=${status || "<empty>"} → invalid, reason DOCUMENT_NOT_ACTIVE`, () => {
    const result = isInstitutionalDocumentValid(valid({ documentStatus: status }));
    assertEquals(result.isValid, false);
    assertEquals(result.reason, "DOCUMENT_NOT_ACTIVE");
  });
}

// =============================================================================
// Rule 4 — revokedAt presence flips to DOCUMENT_REVOKED
// =============================================================================

Deno.test("isInstitutionalDocumentValid: revokedAt set to ISO timestamp → invalid, reason DOCUMENT_REVOKED", () => {
  const result = isInstitutionalDocumentValid(
    valid({ revokedAt: "2026-04-01T00:00:00Z" }),
  );
  assertEquals(result.isValid, false);
  assertEquals(result.reason, "DOCUMENT_REVOKED");
});

Deno.test("isInstitutionalDocumentValid: revokedAt non-empty string → invalid", () => {
  // Any truthy revokedAt triggers Rule 4 — defensive against badly-cast
  // values from older audit rows.
  const result = isInstitutionalDocumentValid(valid({ revokedAt: "anything-truthy" }));
  assertEquals(result.isValid, false);
  assertEquals(result.reason, "DOCUMENT_REVOKED");
});

// =============================================================================
// Rule-order invariants — most-fundamental failure wins
// =============================================================================

Deno.test("rule order: tenant inactive AND billing invalid AND doc inactive AND revoked → TENANT_NOT_ACTIVE wins", () => {
  // All four rules fail. The reason returned must be Rule 1's, because the
  // tenant-level state is the most fundamental: an inactive tenant
  // invalidates everything downstream and shouldn't be reported as a
  // billing or document problem.
  const result = isInstitutionalDocumentValid({
    tenantStatus: "BLOCKED",
    billingStatus: "CANCELED",
    documentStatus: "REVOKED",
    revokedAt: "2026-01-01T00:00:00Z",
  });
  assertEquals(result.reason, "TENANT_NOT_ACTIVE");
});

Deno.test("rule order: tenant ACTIVE but billing invalid AND doc inactive AND revoked → BILLING_INVALID wins", () => {
  const result = isInstitutionalDocumentValid({
    tenantStatus: "ACTIVE",
    billingStatus: "PAST_DUE",
    documentStatus: "REVOKED",
    revokedAt: "2026-01-01T00:00:00Z",
  });
  assertEquals(result.reason, "BILLING_INVALID");
});

Deno.test("rule order: tenant + billing ok, but doc inactive AND revoked → DOCUMENT_NOT_ACTIVE wins", () => {
  // Rule 3 fires before Rule 4 because the document never reached the
  // "active document that got revoked" state — it was inactive from the
  // outset.
  const result = isInstitutionalDocumentValid({
    tenantStatus: "ACTIVE",
    billingStatus: "ACTIVE",
    documentStatus: "DRAFT",
    revokedAt: "2026-01-01T00:00:00Z",
  });
  assertEquals(result.reason, "DOCUMENT_NOT_ACTIVE");
});

Deno.test("rule order: tenant + billing + doc ok, only revoked → DOCUMENT_REVOKED", () => {
  // This is the canonical "an active doc was revoked" case — the only
  // path that surfaces DOCUMENT_REVOKED.
  const result = isInstitutionalDocumentValid({
    tenantStatus: "ACTIVE",
    billingStatus: "ACTIVE",
    documentStatus: "ACTIVE",
    revokedAt: "2026-01-01T00:00:00Z",
  });
  assertEquals(result.reason, "DOCUMENT_REVOKED");
});

// =============================================================================
// isDocumentValid (boolean wrapper)
// =============================================================================

Deno.test("isDocumentValid: returns true when all rules satisfied", () => {
  assert(isDocumentValid(valid()));
});

Deno.test("isDocumentValid: returns false on Rule 1 violation", () => {
  assertFalse(isDocumentValid(valid({ tenantStatus: "BLOCKED" })));
});

Deno.test("isDocumentValid: returns false on Rule 2 violation", () => {
  assertFalse(isDocumentValid(valid({ billingStatus: "PAST_DUE" })));
});

Deno.test("isDocumentValid: returns false on Rule 3 violation", () => {
  assertFalse(isDocumentValid(valid({ documentStatus: "DRAFT" })));
});

Deno.test("isDocumentValid: returns false on Rule 4 violation", () => {
  assertFalse(
    isDocumentValid(valid({ revokedAt: "2026-01-01T00:00:00Z" })),
  );
});
