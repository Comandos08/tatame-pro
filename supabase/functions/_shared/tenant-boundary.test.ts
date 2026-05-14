/**
 * A04 — Contract Tests for tenant-boundary (SAFE GOLD)
 *
 * Multi-tenant isolation is the single most critical invariant in the
 * product. assertTenantAccess sits in front of every privileged Edge
 * Function path; a regression here ranges from "user gets 500 on legit
 * access" through "user pulls another tenant's data". Pin the behavior.
 *
 * Strategy: pure functions (isUuidFormat, TenantBoundaryError) get
 * straightforward unit tests. The Supabase-backed asserts get exercised
 * against a hand-rolled in-memory client that mimics the fluent builder's
 * thenable contract just enough for the call chains used here. No network,
 * no real DB — these tests run anywhere `deno test` runs.
 */
import {
  assertEquals,
  assertRejects,
  assert,
  assertInstanceOf,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isUuidFormat,
  TenantBoundaryError,
  assertTenantAccess,
  assertTenantMatchesImpersonation,
  assertBillingTenantConsistency,
} from "./tenant-boundary.ts";

// =============================================================================
// Minimal Supabase builder mock
// =============================================================================

interface QueryResult {
  data: unknown;
  error: unknown;
}

// Each from(table) pops the next queued result for that table. Builder
// methods (.select/.eq/.is/.limit/.maybeSingle) all return the same
// thenable so `await` works regardless of where the chain stops.
function makeBuilder(result: QueryResult) {
  const promise = Promise.resolve(result);
  // deno-lint-ignore no-explicit-any
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    in: () => builder,
    limit: () => builder,
    maybeSingle: () => builder,
    single: () => builder,
    order: () => builder,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
  return builder;
}

function makeMockSupabase(queues: Record<string, QueryResult[]>) {
  const cursors: Record<string, number> = {};
  return {
    from: (table: string) => {
      const q = queues[table] ?? [];
      const idx = cursors[table] ?? 0;
      const result = q[idx] ?? { data: null, error: null };
      cursors[table] = idx + 1;
      return makeBuilder(result);
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

const VALID_USER = "00000000-0000-4000-8000-000000000001";
const VALID_TENANT = "00000000-0000-4000-8000-000000000002";

// =============================================================================
// isUuidFormat — pure regex guard
// =============================================================================

Deno.test("isUuidFormat: accepts canonical lowercase UUID v4", () => {
  assert(isUuidFormat("550e8400-e29b-41d4-a716-446655440000"));
});

Deno.test("isUuidFormat: accepts uppercase UUID", () => {
  assert(isUuidFormat("550E8400-E29B-41D4-A716-446655440000"));
});

Deno.test("isUuidFormat: accepts mixed-case UUID", () => {
  assert(isUuidFormat("550E8400-e29b-41D4-a716-446655440000"));
});

Deno.test("isUuidFormat: rejects missing dashes", () => {
  assertEquals(isUuidFormat("550e8400e29b41d4a716446655440000"), false);
});

Deno.test("isUuidFormat: rejects too few segments", () => {
  assertEquals(isUuidFormat("550e8400-e29b-41d4-a716"), false);
});

Deno.test("isUuidFormat: rejects empty string", () => {
  assertEquals(isUuidFormat(""), false);
});

Deno.test("isUuidFormat: rejects non-string inputs", () => {
  assertEquals(isUuidFormat(null), false);
  assertEquals(isUuidFormat(undefined), false);
  assertEquals(isUuidFormat(123), false);
  assertEquals(isUuidFormat({}), false);
  assertEquals(isUuidFormat([]), false);
});

Deno.test("isUuidFormat: rejects strings with invalid hex characters", () => {
  assertEquals(isUuidFormat("zzz58400-e29b-41d4-a716-446655440000"), false);
});

// =============================================================================
// TenantBoundaryError
// =============================================================================

Deno.test("TenantBoundaryError: carries code property", () => {
  const e = new TenantBoundaryError("NO_MEMBERSHIP", "msg");
  assertEquals(e.code, "NO_MEMBERSHIP");
  assertEquals(e.message, "msg");
  assertEquals(e.name, "TenantBoundaryError");
});

Deno.test("TenantBoundaryError: is an instanceof Error", () => {
  const e = new TenantBoundaryError("TENANT_NOT_FOUND", "x");
  assertInstanceOf(e, Error);
  assertInstanceOf(e, TenantBoundaryError);
});

// =============================================================================
// assertTenantAccess — failure paths
// =============================================================================

Deno.test("assertTenantAccess: throws TENANT_NOT_FOUND on invalid UUID", async () => {
  const supabase = makeMockSupabase({});
  const err = await assertRejects(
    () => assertTenantAccess(supabase, VALID_USER, "not-a-uuid"),
    TenantBoundaryError,
  );
  assertEquals(err.code, "TENANT_NOT_FOUND");
});

Deno.test("assertTenantAccess: throws TENANT_NOT_FOUND when tenant row missing", async () => {
  const supabase = makeMockSupabase({
    tenants: [{ data: null, error: null }],
  });
  const err = await assertRejects(
    () => assertTenantAccess(supabase, VALID_USER, VALID_TENANT),
    TenantBoundaryError,
  );
  assertEquals(err.code, "TENANT_NOT_FOUND");
});

Deno.test("assertTenantAccess: throws TENANT_INACTIVE for inactive tenant by default", async () => {
  const supabase = makeMockSupabase({
    tenants: [
      { data: { id: VALID_TENANT, is_active: false, lifecycle_status: "TERMINATED" }, error: null },
    ],
  });
  const err = await assertRejects(
    () => assertTenantAccess(supabase, VALID_USER, VALID_TENANT),
    TenantBoundaryError,
  );
  assertEquals(err.code, "TENANT_INACTIVE");
});

Deno.test("assertTenantAccess: allows inactive SETUP tenant when allowLifecycleSetup=true", async () => {
  const supabase = makeMockSupabase({
    tenants: [
      { data: { id: VALID_TENANT, is_active: false, lifecycle_status: "SETUP" }, error: null },
    ],
    user_roles: [
      // 1st query — SUPERADMIN_GLOBAL check
      { data: null, error: null },
      // 2nd query — membership in this tenant
      { data: [{ id: "role-row-1" }], error: null },
    ],
  });
  const result = await assertTenantAccess(
    supabase,
    VALID_USER,
    VALID_TENANT,
    null,
    { allowLifecycleSetup: true },
  );
  assertEquals(result.userId, VALID_USER);
  assertEquals(result.tenantId, VALID_TENANT);
  assertEquals(result.isSuperadmin, false);
});

Deno.test("assertTenantAccess: still rejects inactive non-SETUP tenant even with allowLifecycleSetup=true", async () => {
  const supabase = makeMockSupabase({
    tenants: [
      { data: { id: VALID_TENANT, is_active: false, lifecycle_status: "ACTIVE" }, error: null },
    ],
  });
  const err = await assertRejects(
    () => assertTenantAccess(supabase, VALID_USER, VALID_TENANT, null, { allowLifecycleSetup: true }),
    TenantBoundaryError,
  );
  assertEquals(err.code, "TENANT_INACTIVE");
});

Deno.test("assertTenantAccess: throws NO_MEMBERSHIP for non-superadmin without role", async () => {
  const supabase = makeMockSupabase({
    tenants: [
      { data: { id: VALID_TENANT, is_active: true, lifecycle_status: "ACTIVE" }, error: null },
    ],
    user_roles: [
      // SUPERADMIN_GLOBAL check → not found
      { data: null, error: null },
      // membership check → empty array
      { data: [], error: null },
    ],
  });
  const err = await assertRejects(
    () => assertTenantAccess(supabase, VALID_USER, VALID_TENANT),
    TenantBoundaryError,
  );
  assertEquals(err.code, "NO_MEMBERSHIP");
});

Deno.test("assertTenantAccess: happy path for non-superadmin with valid role", async () => {
  const supabase = makeMockSupabase({
    tenants: [
      { data: { id: VALID_TENANT, is_active: true, lifecycle_status: "ACTIVE" }, error: null },
    ],
    user_roles: [
      { data: null, error: null },
      { data: [{ id: "role-row-1" }], error: null },
    ],
  });
  const result = await assertTenantAccess(supabase, VALID_USER, VALID_TENANT);
  assertEquals(result.userId, VALID_USER);
  assertEquals(result.tenantId, VALID_TENANT);
  assertEquals(result.isSuperadmin, false);
});

// =============================================================================
// assertTenantMatchesImpersonation — missing impersonationId
// =============================================================================

Deno.test("assertTenantMatchesImpersonation: throws IMPERSONATION_REQUIRED when impersonationId is null", async () => {
  const supabase = makeMockSupabase({});
  const err = await assertRejects(
    () => assertTenantMatchesImpersonation(supabase, VALID_USER, VALID_TENANT, null),
    TenantBoundaryError,
  );
  assertEquals(err.code, "IMPERSONATION_REQUIRED");
});

Deno.test("assertTenantMatchesImpersonation: throws IMPERSONATION_REQUIRED when impersonationId is undefined", async () => {
  const supabase = makeMockSupabase({});
  const err = await assertRejects(
    () => assertTenantMatchesImpersonation(supabase, VALID_USER, VALID_TENANT),
    TenantBoundaryError,
  );
  assertEquals(err.code, "IMPERSONATION_REQUIRED");
});

// =============================================================================
// assertBillingTenantConsistency
// =============================================================================

Deno.test("assertBillingTenantConsistency: no-op when tenant row missing", async () => {
  const supabase = makeMockSupabase({
    tenants: [{ data: null, error: null }],
    tenant_billing: [{ data: null, error: null }],
  });
  // Must not throw
  await assertBillingTenantConsistency(supabase, VALID_TENANT);
});

Deno.test("assertBillingTenantConsistency: no-op when billing row missing", async () => {
  const supabase = makeMockSupabase({
    tenants: [{ data: { is_active: true }, error: null }],
    tenant_billing: [{ data: null, error: null }],
  });
  await assertBillingTenantConsistency(supabase, VALID_TENANT);
});

Deno.test("assertBillingTenantConsistency: no-op when billing status is unknown", async () => {
  const supabase = makeMockSupabase({
    tenants: [{ data: { is_active: true }, error: null }],
    tenant_billing: [{ data: { status: "INVENTED_STATUS" }, error: null }],
  });
  // Unknown status → log + return (no throw)
  await assertBillingTenantConsistency(supabase, VALID_TENANT);
});

Deno.test("assertBillingTenantConsistency: passes when ACTIVE + is_active=true", async () => {
  const supabase = makeMockSupabase({
    tenants: [{ data: { is_active: true }, error: null }],
    tenant_billing: [{ data: { status: "ACTIVE" }, error: null }],
  });
  await assertBillingTenantConsistency(supabase, VALID_TENANT);
});

Deno.test("assertBillingTenantConsistency: passes when CANCELED + is_active=false", async () => {
  const supabase = makeMockSupabase({
    tenants: [{ data: { is_active: false }, error: null }],
    tenant_billing: [{ data: { status: "CANCELED" }, error: null }],
  });
  await assertBillingTenantConsistency(supabase, VALID_TENANT);
});

Deno.test("assertBillingTenantConsistency: throws on ACTIVE + is_active=false drift", async () => {
  const supabase = makeMockSupabase({
    tenants: [{ data: { is_active: false }, error: null }],
    tenant_billing: [{ data: { status: "ACTIVE" }, error: null }],
  });
  const err = await assertRejects(
    () => assertBillingTenantConsistency(supabase, VALID_TENANT),
    Error,
    "consistency mismatch",
  );
  assert(err.message.includes("ACTIVE"));
  assert(err.message.includes("false"));
});

Deno.test("assertBillingTenantConsistency: throws on CANCELED + is_active=true drift", async () => {
  const supabase = makeMockSupabase({
    tenants: [{ data: { is_active: true }, error: null }],
    tenant_billing: [{ data: { status: "CANCELED" }, error: null }],
  });
  await assertRejects(
    () => assertBillingTenantConsistency(supabase, VALID_TENANT),
    Error,
    "consistency mismatch",
  );
});

Deno.test("assertBillingTenantConsistency: passes when TRIALING + is_active=true", async () => {
  const supabase = makeMockSupabase({
    tenants: [{ data: { is_active: true }, error: null }],
    tenant_billing: [{ data: { status: "TRIALING" }, error: null }],
  });
  await assertBillingTenantConsistency(supabase, VALID_TENANT);
});

Deno.test("assertBillingTenantConsistency: throws on PAST_DUE + is_active=true (PAST_DUE expects inactive)", async () => {
  const supabase = makeMockSupabase({
    tenants: [{ data: { is_active: true }, error: null }],
    tenant_billing: [{ data: { status: "PAST_DUE" }, error: null }],
  });
  await assertRejects(
    () => assertBillingTenantConsistency(supabase, VALID_TENANT),
    Error,
  );
});
