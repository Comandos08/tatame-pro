/**
 * A03 — Contract Tests for Billing State Machine (SAFE GOLD)
 *
 * Deterministic, no side effects, no network. Pins the public contract of
 * billing-state-machine.ts so any future change to the transition graph,
 * the Stripe mapping, or the is_active derivation surfaces as a CI failure
 * instead of a silent tenant-lifecycle bug.
 */
import {
  assertEquals,
  assertThrows,
  assertFalse,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isKnownBillingStatus,
  assertValidBillingTransition,
  deriveTenantActive,
  assertBillingConsistency,
  mapStripeStatusToBilling,
  BILLING_STATUSES,
  type BillingStatus,
} from "./billing-state-machine.ts";

// ============================================================================
// isKnownBillingStatus — type guard
// ============================================================================

Deno.test("isKnownBillingStatus: accepts every BILLING_STATUSES member", () => {
  for (const status of BILLING_STATUSES) {
    assert(isKnownBillingStatus(status), `expected ${status} to be valid`);
  }
});

Deno.test("isKnownBillingStatus: rejects unknown strings", () => {
  assertFalse(isKnownBillingStatus("UNKNOWN"));
  assertFalse(isKnownBillingStatus(""));
  assertFalse(isKnownBillingStatus("active")); // case-sensitive
});

Deno.test("isKnownBillingStatus: rejects non-string inputs without throwing", () => {
  assertFalse(isKnownBillingStatus(null));
  assertFalse(isKnownBillingStatus(undefined));
  assertFalse(isKnownBillingStatus(42));
  assertFalse(isKnownBillingStatus(true));
  assertFalse(isKnownBillingStatus({}));
  assertFalse(isKnownBillingStatus([]));
});

// ============================================================================
// assertValidBillingTransition — fail-closed transition graph
// ============================================================================

// Each row is [from, to] for a transition that MUST be allowed.
const ALLOWED: Array<[BillingStatus, BillingStatus]> = [
  ["TRIALING", "ACTIVE"],
  ["TRIALING", "TRIAL_EXPIRED"],
  ["TRIALING", "CANCELED"],
  ["ACTIVE", "PAST_DUE"],
  ["ACTIVE", "CANCELED"],
  ["PAST_DUE", "ACTIVE"],
  ["PAST_DUE", "UNPAID"],
  ["PAST_DUE", "CANCELED"],
  ["UNPAID", "ACTIVE"],
  ["UNPAID", "CANCELED"],
  ["INCOMPLETE", "ACTIVE"],
  ["INCOMPLETE", "CANCELED"],
  ["TRIAL_EXPIRED", "ACTIVE"],
  ["TRIAL_EXPIRED", "PENDING_DELETE"],
  ["TRIAL_EXPIRED", "CANCELED"],
  ["PENDING_DELETE", "ACTIVE"],
  ["PENDING_DELETE", "CANCELED"],
];

for (const [from, to] of ALLOWED) {
  Deno.test(`assertValidBillingTransition: allows ${from} → ${to}`, () => {
    // Must not throw.
    assertValidBillingTransition(from, to);
  });
}

Deno.test("assertValidBillingTransition: CANCELED is terminal — no outgoing transitions", () => {
  for (const status of BILLING_STATUSES) {
    assertThrows(
      () => assertValidBillingTransition("CANCELED", status),
      Error,
      "Invalid billing transition",
    );
  }
});

Deno.test("assertValidBillingTransition: rejects self-transitions (none are explicitly allowed)", () => {
  for (const status of BILLING_STATUSES) {
    assertThrows(
      () => assertValidBillingTransition(status, status),
      Error,
      "Invalid billing transition",
    );
  }
});

Deno.test("assertValidBillingTransition: rejects backwards ACTIVE → TRIALING", () => {
  assertThrows(
    () => assertValidBillingTransition("ACTIVE", "TRIALING"),
    Error,
    "Invalid billing transition: ACTIVE → TRIALING",
  );
});

Deno.test("assertValidBillingTransition: rejects backwards ACTIVE → INCOMPLETE", () => {
  assertThrows(
    () => assertValidBillingTransition("ACTIVE", "INCOMPLETE"),
    Error,
  );
});

Deno.test("assertValidBillingTransition: rejects TRIAL_EXPIRED → TRIALING (no re-trial)", () => {
  assertThrows(
    () => assertValidBillingTransition("TRIAL_EXPIRED", "TRIALING"),
    Error,
  );
});

Deno.test("assertValidBillingTransition: error message includes both states", () => {
  try {
    assertValidBillingTransition("CANCELED", "ACTIVE");
    throw new Error("should have thrown");
  } catch (e) {
    assert(e instanceof Error);
    assert(e.message.includes("CANCELED"));
    assert(e.message.includes("ACTIVE"));
  }
});

// ============================================================================
// deriveTenantActive — single source of truth for tenants.is_active
// ============================================================================

Deno.test("deriveTenantActive: ACTIVE → true", () => {
  assertEquals(deriveTenantActive("ACTIVE"), true);
});

Deno.test("deriveTenantActive: TRIALING → true", () => {
  assertEquals(deriveTenantActive("TRIALING"), true);
});

Deno.test("deriveTenantActive: every non-active status → false", () => {
  const inactive: BillingStatus[] = [
    "PAST_DUE",
    "UNPAID",
    "CANCELED",
    "INCOMPLETE",
    "TRIAL_EXPIRED",
    "PENDING_DELETE",
  ];
  for (const s of inactive) {
    assertEquals(deriveTenantActive(s), false, `expected ${s} to be inactive`);
  }
});

// ============================================================================
// assertBillingConsistency — post-write sanity check
// ============================================================================

Deno.test("assertBillingConsistency: passes when ACTIVE+is_active=true", () => {
  assertBillingConsistency("ACTIVE", true); // must not throw
});

Deno.test("assertBillingConsistency: passes when TRIALING+is_active=true", () => {
  assertBillingConsistency("TRIALING", true);
});

Deno.test("assertBillingConsistency: passes when CANCELED+is_active=false", () => {
  assertBillingConsistency("CANCELED", false);
});

Deno.test("assertBillingConsistency: throws on ACTIVE+is_active=false (active tenant flagged inactive)", () => {
  assertThrows(
    () => assertBillingConsistency("ACTIVE", false),
    Error,
    "Billing consistency mismatch",
  );
});

Deno.test("assertBillingConsistency: throws on CANCELED+is_active=true (cancelled tenant still active)", () => {
  assertThrows(
    () => assertBillingConsistency("CANCELED", true),
    Error,
    "Billing consistency mismatch",
  );
});

Deno.test("assertBillingConsistency: error message includes expected and got", () => {
  try {
    assertBillingConsistency("PAST_DUE", true);
    throw new Error("should have thrown");
  } catch (e) {
    assert(e instanceof Error);
    assert(e.message.includes("PAST_DUE"));
    assert(e.message.includes("is_active=false"));
    assert(e.message.includes("got true"));
  }
});

// ============================================================================
// mapStripeStatusToBilling — Stripe ↔ canonical mapping
// ============================================================================

const STRIPE_MAP: Array<[string, BillingStatus]> = [
  ["active", "ACTIVE"],
  ["trialing", "TRIALING"],
  ["past_due", "PAST_DUE"],
  ["unpaid", "UNPAID"],
  ["canceled", "CANCELED"],
  ["incomplete", "INCOMPLETE"],
  ["incomplete_expired", "CANCELED"], // collapses to CANCELED
  ["paused", "PAST_DUE"],             // collapses to PAST_DUE
];

for (const [stripe, canonical] of STRIPE_MAP) {
  Deno.test(`mapStripeStatusToBilling: ${stripe} → ${canonical}`, () => {
    assertEquals(mapStripeStatusToBilling(stripe), canonical);
  });
}

Deno.test("mapStripeStatusToBilling: unknown status → INCOMPLETE (fail-safe default)", () => {
  assertEquals(mapStripeStatusToBilling("invented_status"), "INCOMPLETE");
  assertEquals(mapStripeStatusToBilling(""), "INCOMPLETE");
});

Deno.test("mapStripeStatusToBilling: is case-sensitive (Stripe always sends lowercase)", () => {
  // Stripe's API contract is lowercase status strings — uppercase shouldn't
  // accidentally map to anything. We treat it as unknown → INCOMPLETE.
  assertEquals(mapStripeStatusToBilling("ACTIVE"), "INCOMPLETE");
});

Deno.test(
  "mapStripeStatusToBilling: every output is a valid BillingStatus",
  () => {
    for (const [stripe] of STRIPE_MAP) {
      const result = mapStripeStatusToBilling(stripe);
      assert(
        isKnownBillingStatus(result),
        `mapping for ${stripe} produced invalid status: ${result}`,
      );
    }
    // And the fallback:
    assert(isKnownBillingStatus(mapStripeStatusToBilling("nope")));
  },
);

// ============================================================================
// BILLING_STATUSES — array invariants
// ============================================================================

Deno.test("BILLING_STATUSES: contains exactly the 8 declared statuses", () => {
  assertEquals(BILLING_STATUSES.length, 8);
});

Deno.test("BILLING_STATUSES: has no duplicates", () => {
  const set = new Set(BILLING_STATUSES);
  assertEquals(set.size, BILLING_STATUSES.length);
});
