/**
 * Contract tests for requireBillingStatus — the billing access gate.
 *
 * Every privileged write path in the system flows through this function.
 * A regression here is one of two things:
 *   - allows a write on a tenant that should be blocked (revenue + integrity
 *     violation), or
 *   - blocks a write on a tenant that should be allowed (paying customer
 *     locked out).
 *
 * Both modes pinned: every status in BillingStatus is exercised, the
 * manual-override bypass is pinned to the exact path documented in the
 * source, and the fail-closed contract (DB error / missing row / thrown
 * exception → blocked) is pinned with the correct error codes so callers
 * keep rendering the right BILLING_RESTRICTED messages.
 */
import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireBillingStatus, billingRestrictedResponse } from "./requireBillingStatus.ts";

// =============================================================================
// Minimal Supabase builder mock
// =============================================================================
// requireBillingStatus issues exactly one chain per call:
//   .from("tenant_billing").select(...).eq(...).maybeSingle()
// The thenable below short-circuits the chain to the queued result.

interface QueryResult {
  data: unknown;
  error: unknown;
}

function makeMockSupabase(billing: QueryResult | (() => Promise<QueryResult>)) {
  // deno-lint-ignore no-explicit-any
  return {
    from: (table: string) => {
      assertEquals(table, "tenant_billing"); // contract: only one table touched
      const resultPromise =
        typeof billing === "function"
          ? billing()
          : Promise.resolve(billing);
      // deno-lint-ignore no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => resultPromise,
        then: (...args: unknown[]) =>
          // deno-lint-ignore no-explicit-any
          (resultPromise.then as any)(...args),
      };
      return builder;
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

const TENANT = "00000000-0000-4000-8000-000000000001";

// =============================================================================
// Happy paths — ALLOWED_STATUSES
// =============================================================================

Deno.test("requireBillingStatus: ACTIVE → allowed=true, status=ACTIVE", async () => {
  const supabase = makeMockSupabase({
    data: { status: "ACTIVE", is_manual_override: false },
    error: null,
  });
  const result = await requireBillingStatus(supabase, TENANT);
  assertEquals(result, {
    allowed: true,
    status: "ACTIVE",
    isManualOverride: false,
  });
});

Deno.test("requireBillingStatus: TRIALING → allowed=true, status=TRIALING", async () => {
  const supabase = makeMockSupabase({
    data: { status: "TRIALING", is_manual_override: false },
    error: null,
  });
  const result = await requireBillingStatus(supabase, TENANT);
  assertEquals(result.allowed, true);
  assertEquals(result.status, "TRIALING");
  assertEquals(result.isManualOverride, false);
});

// =============================================================================
// Restricted statuses — every BillingStatus except ACTIVE/TRIALING
// =============================================================================

const RESTRICTED_STATUSES = [
  "TRIAL_EXPIRED",
  "PENDING_DELETE",
  "PAST_DUE",
  "CANCELED",
  "UNPAID",
  "INCOMPLETE",
];

for (const status of RESTRICTED_STATUSES) {
  Deno.test(`requireBillingStatus: ${status} → allowed=false, code=BILLING_RESTRICTED`, async () => {
    const supabase = makeMockSupabase({
      data: { status, is_manual_override: false },
      error: null,
    });
    const result = await requireBillingStatus(supabase, TENANT);
    assertEquals(result.allowed, false);
    assertEquals(result.status, status);
    assertEquals(result.code, "BILLING_RESTRICTED");
    // Error message includes the offending status — callers surface it.
    assert(result.error?.includes(status));
  });
}

// =============================================================================
// Manual override — the support escape hatch
// =============================================================================

Deno.test("requireBillingStatus: manual override bypasses CANCELED status", async () => {
  // CANCELED would normally fail, but is_manual_override=true short-circuits
  // the allowlist check (Step 4 fires before Step 5 in the source).
  const supabase = makeMockSupabase({
    data: { status: "CANCELED", is_manual_override: true },
    error: null,
  });
  const result = await requireBillingStatus(supabase, TENANT);
  assertEquals(result.allowed, true);
  assertEquals(result.status, "CANCELED");
  assertEquals(result.isManualOverride, true);
});

Deno.test("requireBillingStatus: manual override bypasses PAST_DUE", async () => {
  const supabase = makeMockSupabase({
    data: { status: "PAST_DUE", is_manual_override: true },
    error: null,
  });
  const result = await requireBillingStatus(supabase, TENANT);
  assertEquals(result.allowed, true);
  assertEquals(result.isManualOverride, true);
});

Deno.test("requireBillingStatus: manual override flag must be strictly === true", async () => {
  // Defensive: a JSON null/undefined/string must NOT enable the override.
  // The source compares `=== true`, not truthiness.
  for (const flag of [null, undefined, "true", 1, {}] as const) {
    const supabase = makeMockSupabase({
      data: { status: "CANCELED", is_manual_override: flag as unknown },
      error: null,
    });
    const result = await requireBillingStatus(supabase, TENANT);
    assertEquals(
      result.allowed,
      false,
      `flag=${JSON.stringify(flag)} should NOT trigger override`,
    );
    assertEquals(result.code, "BILLING_RESTRICTED");
  }
});

// =============================================================================
// Fail-closed contract — DB error / missing row / thrown exception
// =============================================================================

Deno.test("requireBillingStatus: DB error → blocked with code=BILLING_CHECK_ERROR", async () => {
  const supabase = makeMockSupabase({
    data: null,
    error: { message: "connection refused" },
  });
  const result = await requireBillingStatus(supabase, TENANT);
  assertFalse(result.allowed);
  assertEquals(result.status, null);
  assertEquals(result.isManualOverride, false);
  assertEquals(result.code, "BILLING_CHECK_ERROR");
});

Deno.test("requireBillingStatus: missing billing row → blocked with code=BILLING_NOT_FOUND", async () => {
  // Intentional: no record = no proof of payment = no access. Tested
  // because legacy seed bugs occasionally created tenants without a
  // tenant_billing row, and silently allowing them would let trial-skipping
  // through.
  const supabase = makeMockSupabase({ data: null, error: null });
  const result = await requireBillingStatus(supabase, TENANT);
  assertFalse(result.allowed);
  assertEquals(result.status, null);
  assertEquals(result.code, "BILLING_NOT_FOUND");
});

Deno.test("requireBillingStatus: thrown exception in builder → blocked with code=BILLING_CHECK_ERROR", async () => {
  // Simulates a Supabase client that throws synchronously inside the await
  // (e.g. network reset mid-request). The outer try/catch must convert it
  // into the same blocked envelope as a returned `error`.
  const supabase = makeMockSupabase(() =>
    Promise.reject(new Error("network reset")),
  );
  const result = await requireBillingStatus(supabase, TENANT);
  assertFalse(result.allowed);
  assertEquals(result.code, "BILLING_CHECK_ERROR");
});

// =============================================================================
// billingRestrictedResponse — caller-facing envelope
// =============================================================================

Deno.test("billingRestrictedResponse: returns 403 JSON with BILLING_RESTRICTED code", async () => {
  const res = billingRestrictedResponse("PAST_DUE");
  assertEquals(res.status, 403);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = await res.json();
  assertEquals(body.ok, false);
  assertEquals(body.code, "BILLING_RESTRICTED");
  assertEquals(body.status, "PAST_DUE");
  assertEquals(typeof body.error, "string");
});

Deno.test("billingRestrictedResponse: carries null status when unknown", async () => {
  const res = billingRestrictedResponse(null);
  const body = await res.json();
  assertEquals(body.status, null);
  assertEquals(body.code, "BILLING_RESTRICTED");
});
