/**
 * Contract tests for resolveMembershipNotification (Deno backend copy).
 *
 * notification-engine is a pure decision function — given a state transition
 * it returns "send template X with payload Y" or "send nothing". Every
 * scheduled job (expire-trials, expire-memberships, pre-expiration-scheduler,
 * check-trial-ending, check-membership-renewal) and every state-changing
 * Edge Function (approve-membership, reject-membership, cancel-membership-
 * manual, reactivate-membership-manual, stripe-webhook) routes through it.
 *
 * A regression that flips a single rule's predicate can either:
 *   - silently stop sending a notification a user expects (e.g. approval),
 *   - or worse, spam the user with a wrong template (e.g. CANCELLED instead
 *     of EXPIRED).
 *
 * The file header says "Keep in sync with the frontend version" — the
 * frontend already has a spec at src/lib/notifications/__tests__. This
 * file's job is to catch drift in the BACKEND copy specifically.
 */
import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolveMembershipNotification,
  shouldSend,
  shouldNotSend,
  type NotificationInput,
  type MembershipStatus,
  type ExpiringVirtualStatus,
  type SupportedLocale,
} from "./notification-engine.ts";

// =============================================================================
// Fixture builder
// =============================================================================

function makeInput(overrides: Partial<NotificationInput> = {}): NotificationInput {
  return {
    previousStatus: "PENDING_REVIEW",
    newStatus: "APPROVED",
    membership: {
      id: "membership-1",
      endDate: "2026-12-31",
    },
    athlete: {
      fullName: "Alice Silva",
      email: "alice@example.com",
    },
    tenant: {
      name: "Tatame Pro",
      slug: "tatame",
      defaultLocale: "pt-BR",
    },
    baseUrl: "https://app.tatame.pro",
    ...overrides,
  };
}

// =============================================================================
// RULE 0 — Virtual EXPIRING_* statuses
// =============================================================================

const EXPIRING_PROBES: Array<[ExpiringVirtualStatus, number, string]> = [
  ["EXPIRING_30D", 30, "membership_expiring_30d"],
  ["EXPIRING_15D", 15, "membership_expiring_15d"],
  ["EXPIRING_7D", 7, "membership_expiring_7d"],
  ["EXPIRING_3D", 3, "membership_expiring_3d"],
  ["EXPIRING_1D", 1, "membership_expiring_1d"],
];

for (const [status, expectedDays, expectedTemplate] of EXPIRING_PROBES) {
  Deno.test(`resolveMembershipNotification: ${status} → sends ${expectedTemplate} with ${expectedDays} days`, () => {
    const decision = resolveMembershipNotification(
      makeInput({ previousStatus: "ACTIVE", newStatus: status }),
    );
    assert(shouldSend(decision));
    assertEquals(decision.templateId, expectedTemplate);
    if (decision.payload.templateId.startsWith("membership_expiring_")) {
      assertEquals(decision.payload.daysRemaining, expectedDays);
    }
  });
}

Deno.test("resolveMembershipNotification: EXPIRING_* uses daysToExpire override when provided", () => {
  const decision = resolveMembershipNotification(
    makeInput({
      previousStatus: "ACTIVE",
      newStatus: "EXPIRING_7D",
      daysToExpire: 5, // override
    }),
  );
  assert(shouldSend(decision));
  if (decision.payload.templateId === "membership_expiring_7d") {
    assertEquals(decision.payload.daysRemaining, 5);
  }
});

Deno.test("resolveMembershipNotification: EXPIRING_* includes renewUrl in payload", () => {
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: "ACTIVE", newStatus: "EXPIRING_30D" }),
  );
  assert(shouldSend(decision));
  if (decision.payload.templateId.startsWith("membership_expiring_")) {
    assertEquals(
      decision.payload.renewUrl,
      "https://app.tatame.pro/tatame/membership/renew",
    );
  }
});

Deno.test("resolveMembershipNotification: EXPIRING_* fires regardless of previousStatus", () => {
  // The pre-expiration scheduler computes the virtual status without caring
  // about transitions. Even a contrived previousStatus must not block it.
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: null, newStatus: "EXPIRING_15D" }),
  );
  assert(shouldSend(decision));
});

// =============================================================================
// RULE 1 — same-status transitions
// =============================================================================

const STATUSES: MembershipStatus[] = [
  "DRAFT",
  "PENDING_PAYMENT",
  "PENDING_REVIEW",
  "APPROVED",
  "ACTIVE",
  "EXPIRED",
  "CANCELLED",
  "REJECTED",
];

for (const status of STATUSES) {
  // PENDING_PAYMENT same-status is also blocked by RULE 3, but every other
  // same-status MUST hit RULE 1 first.
  Deno.test(`resolveMembershipNotification: ${status} → ${status} sends nothing (same-status guard)`, () => {
    const decision = resolveMembershipNotification(
      makeInput({ previousStatus: status, newStatus: status }),
    );
    assertFalse(shouldSend(decision));
    assert(shouldNotSend(decision));
  });
}

// =============================================================================
// RULE 2 — DRAFT → PENDING_REVIEW
// =============================================================================

Deno.test("resolveMembershipNotification: DRAFT → PENDING_REVIEW sends nothing (user just submitted)", () => {
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: "DRAFT", newStatus: "PENDING_REVIEW" }),
  );
  assertFalse(shouldSend(decision));
});

// =============================================================================
// RULE 3 — PENDING_PAYMENT involvement
// =============================================================================

Deno.test("resolveMembershipNotification: PENDING_PAYMENT → ACTIVE sends nothing", () => {
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: "PENDING_PAYMENT", newStatus: "ACTIVE" }),
  );
  assertFalse(shouldSend(decision));
});

Deno.test("resolveMembershipNotification: PENDING_REVIEW → PENDING_PAYMENT sends nothing", () => {
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: "PENDING_REVIEW", newStatus: "PENDING_PAYMENT" }),
  );
  assertFalse(shouldSend(decision));
});

Deno.test("resolveMembershipNotification: DRAFT → PENDING_PAYMENT sends nothing", () => {
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: "DRAFT", newStatus: "PENDING_PAYMENT" }),
  );
  assertFalse(shouldSend(decision));
});

// =============================================================================
// RULE 4 — renewal confirmation
// =============================================================================

Deno.test("resolveMembershipNotification: isRenewalConfirmation=true + newStatus=ACTIVE → membership_renewed", () => {
  const decision = resolveMembershipNotification(
    makeInput({
      previousStatus: "EXPIRED",
      newStatus: "ACTIVE",
      isRenewalConfirmation: true,
      membership: { id: "m-1", endDate: "2027-06-15" },
    }),
  );
  assert(shouldSend(decision));
  assertEquals(decision.templateId, "membership_renewed");
  if (decision.payload.templateId === "membership_renewed") {
    assertEquals(decision.payload.newExpirationDate, "2027-06-15");
    assertEquals(
      decision.payload.portalUrl,
      "https://app.tatame.pro/tatame/portal",
    );
  }
});

Deno.test("resolveMembershipNotification: isRenewalConfirmation=true but newStatus≠ACTIVE → falls through to other rules", () => {
  // Renewal confirmation only applies when terminating at ACTIVE.
  // EXPIRED → CANCELLED with renewal flag should still hit the CANCELLED rule.
  const decision = resolveMembershipNotification(
    makeInput({
      previousStatus: "ACTIVE",
      newStatus: "CANCELLED",
      isRenewalConfirmation: true,
    }),
  );
  assert(shouldSend(decision));
  assertEquals(decision.templateId, "membership_cancelled");
});

// =============================================================================
// RULE 5 — PENDING_REVIEW → APPROVED
// =============================================================================

Deno.test("resolveMembershipNotification: PENDING_REVIEW → APPROVED → membership_approved with portalUrl", () => {
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: "PENDING_REVIEW", newStatus: "APPROVED" }),
  );
  assert(shouldSend(decision));
  assertEquals(decision.templateId, "membership_approved");
  if (decision.payload.templateId === "membership_approved") {
    assertEquals(decision.payload.athleteName, "Alice Silva");
    assertEquals(decision.payload.tenantName, "Tatame Pro");
    assertEquals(
      decision.payload.portalUrl,
      "https://app.tatame.pro/tatame/portal",
    );
  }
});

// =============================================================================
// RULE 6 — PENDING_REVIEW → REJECTED
// =============================================================================

Deno.test("resolveMembershipNotification: PENDING_REVIEW → REJECTED → membership_rejected with reason", () => {
  const decision = resolveMembershipNotification(
    makeInput({
      previousStatus: "PENDING_REVIEW",
      newStatus: "REJECTED",
      membership: { id: "m-1", rejectionReason: "Documents incomplete" },
    }),
  );
  assert(shouldSend(decision));
  assertEquals(decision.templateId, "membership_rejected");
  if (decision.payload.templateId === "membership_rejected") {
    assertEquals(decision.payload.rejectionReason, "Documents incomplete");
  }
});

Deno.test("resolveMembershipNotification: REJECTED with no rejectionReason falls back to PT-BR default", () => {
  const decision = resolveMembershipNotification(
    makeInput({
      previousStatus: "PENDING_REVIEW",
      newStatus: "REJECTED",
      membership: { id: "m-1" }, // no rejectionReason
    }),
  );
  assert(shouldSend(decision));
  if (decision.payload.templateId === "membership_rejected") {
    assertEquals(decision.payload.rejectionReason, "Motivo não informado");
  }
});

// =============================================================================
// RULE 7 — ACTIVE → EXPIRED
// =============================================================================

Deno.test("resolveMembershipNotification: ACTIVE → EXPIRED → membership_expired with renewUrl", () => {
  const decision = resolveMembershipNotification(
    makeInput({
      previousStatus: "ACTIVE",
      newStatus: "EXPIRED",
      membership: { id: "m-1", endDate: "2026-05-01" },
    }),
  );
  assert(shouldSend(decision));
  assertEquals(decision.templateId, "membership_expired");
  if (decision.payload.templateId === "membership_expired") {
    assertEquals(decision.payload.expirationDate, "2026-05-01");
    assertEquals(
      decision.payload.renewUrl,
      "https://app.tatame.pro/tatame/membership/renew",
    );
  }
});

// =============================================================================
// RULE 8 & 9 — cancellation paths
// =============================================================================

Deno.test("resolveMembershipNotification: ACTIVE → CANCELLED → membership_cancelled", () => {
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: "ACTIVE", newStatus: "CANCELLED" }),
  );
  assert(shouldSend(decision));
  assertEquals(decision.templateId, "membership_cancelled");
});

Deno.test("resolveMembershipNotification: APPROVED → CANCELLED → membership_cancelled", () => {
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: "APPROVED", newStatus: "CANCELLED" }),
  );
  assert(shouldSend(decision));
  assertEquals(decision.templateId, "membership_cancelled");
});

Deno.test("resolveMembershipNotification: PENDING_REVIEW → CANCELLED does NOT trigger cancellation email (not in rules 8/9)", () => {
  // Only ACTIVE→CANCELLED and APPROVED→CANCELLED send the email. Cancelling
  // from PENDING_REVIEW (an admin rejecting before approval) shouldn't.
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: "PENDING_REVIEW", newStatus: "CANCELLED" }),
  );
  assertFalse(shouldSend(decision));
});

Deno.test("resolveMembershipNotification: DRAFT → CANCELLED does NOT trigger cancellation email", () => {
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: "DRAFT", newStatus: "CANCELLED" }),
  );
  assertFalse(shouldSend(decision));
});

// =============================================================================
// DEFAULT — unlisted transitions
// =============================================================================

Deno.test("resolveMembershipNotification: EXPIRED → APPROVED returns no email (not a documented transition)", () => {
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: "EXPIRED", newStatus: "APPROVED" }),
  );
  assertFalse(shouldSend(decision));
});

Deno.test("resolveMembershipNotification: REJECTED → APPROVED returns no email (resubmission would be DRAFT path)", () => {
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: "REJECTED", newStatus: "APPROVED" }),
  );
  assertFalse(shouldSend(decision));
});

Deno.test("resolveMembershipNotification: null previousStatus + APPROVED returns no email (first transition is via PENDING_REVIEW only)", () => {
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: null, newStatus: "APPROVED" }),
  );
  assertFalse(shouldSend(decision));
});

// =============================================================================
// Locale resolution
// =============================================================================

Deno.test("resolveMembershipNotification: athlete.preferredLocale overrides tenant.defaultLocale", () => {
  const decision = resolveMembershipNotification(
    makeInput({
      previousStatus: "PENDING_REVIEW",
      newStatus: "APPROVED",
      athlete: {
        fullName: "Alice",
        email: "alice@x.com",
        preferredLocale: "en",
      },
      tenant: {
        name: "Tatame Pro",
        slug: "tatame",
        defaultLocale: "pt-BR",
      },
    }),
  );
  assert(shouldSend(decision));
  assertEquals(decision.locale, "en");
});

Deno.test("resolveMembershipNotification: falls back to tenant.defaultLocale when athlete.preferredLocale absent", () => {
  const decision = resolveMembershipNotification(
    makeInput({
      previousStatus: "PENDING_REVIEW",
      newStatus: "APPROVED",
      tenant: { name: "T", slug: "tatame", defaultLocale: "pt-BR" as SupportedLocale },
    }),
  );
  assert(shouldSend(decision));
  assertEquals(decision.locale, "pt-BR");
});

// =============================================================================
// CTA URL building
// =============================================================================

Deno.test("resolveMembershipNotification: ctaUrl uses tenant slug + template path", () => {
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: "PENDING_REVIEW", newStatus: "APPROVED" }),
  );
  assert(shouldSend(decision));
  assertEquals(decision.ctaUrl, "https://app.tatame.pro/tatame/portal");
});

Deno.test("resolveMembershipNotification: ctaUrl strips trailing slash from baseUrl", () => {
  const decision = resolveMembershipNotification(
    makeInput({
      previousStatus: "PENDING_REVIEW",
      newStatus: "APPROVED",
      baseUrl: "https://app.tatame.pro/",
    }),
  );
  assert(shouldSend(decision));
  // No double slash between domain and /tatame
  assertEquals(decision.ctaUrl, "https://app.tatame.pro/tatame/portal");
});

Deno.test("resolveMembershipNotification: rejected ctaUrl points to /membership/new", () => {
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: "PENDING_REVIEW", newStatus: "REJECTED" }),
  );
  assert(shouldSend(decision));
  assertEquals(decision.ctaUrl, "https://app.tatame.pro/tatame/membership/new");
});

Deno.test("resolveMembershipNotification: expired ctaUrl points to /membership/renew", () => {
  const decision = resolveMembershipNotification(
    makeInput({ previousStatus: "ACTIVE", newStatus: "EXPIRED" }),
  );
  assert(shouldSend(decision));
  assertEquals(decision.ctaUrl, "https://app.tatame.pro/tatame/membership/renew");
});

// =============================================================================
// Type guards
// =============================================================================

Deno.test("shouldSend / shouldNotSend: type guards behave as inverses on send decisions", () => {
  const send = resolveMembershipNotification(
    makeInput({ previousStatus: "PENDING_REVIEW", newStatus: "APPROVED" }),
  );
  assert(shouldSend(send));
  assertFalse(shouldNotSend(send));
});

Deno.test("shouldSend / shouldNotSend: type guards behave as inverses on no-send decisions", () => {
  const noSend = resolveMembershipNotification(
    makeInput({ previousStatus: "DRAFT", newStatus: "PENDING_REVIEW" }),
  );
  assertFalse(shouldSend(noSend));
  assert(shouldNotSend(noSend));
});
