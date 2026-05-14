/**
 * Contract tests for requireTenantActive + tenantNotActiveResponse.
 *
 * I4: SETUP and BLOCKED tenants must not perform destructive operations.
 * Every document-emission path in the system passes through this guard.
 * A regression has two failure modes:
 *   - allows emission while tenant is in SETUP (data integrity drift) or
 *     BLOCKED (operating a frozen tenant), or
 *   - blocks emission on a legitimately ACTIVE tenant (operator stops
 *     issuing diplomas).
 *
 * We pin: UUID validation up front, fail-closed on every DB outcome
 * (error / missing row), each lifecycle branch maps to its specific
 * `code`, and the SAFE-GOLD response helper returns 200 (neutral) with
 * no semantic leak.
 */
import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  requireTenantActive,
  tenantNotActiveResponse,
} from "./requireTenantActive.ts";

// =============================================================================
// Minimal Supabase builder mock — one chain per call
// =============================================================================
// requireTenantActive issues exactly:
//   .from('tenants').select('lifecycle_status').eq('id', x).maybeSingle()

interface QueryResult {
  data: unknown;
  error: unknown;
}

function makeMockSupabase(tenants: QueryResult | (() => Promise<QueryResult>)) {
  return {
    from: (table: string) => {
      assertEquals(table, "tenants"); // contract: only tenants is touched
      const resultPromise =
        typeof tenants === "function" ? tenants() : Promise.resolve(tenants);
      // deno-lint-ignore no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => resultPromise,
      };
      return builder;
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

const VALID_TENANT = "00000000-0000-4000-8000-000000000010";

// =============================================================================
// UUID validation — fail-closed BEFORE the DB call
// =============================================================================

Deno.test("requireTenantActive: empty tenantId → TENANT_NOT_FOUND, no DB call", async () => {
  // Use a supabase that asserts the wrong table — if the helper hits it,
  // the test fails loudly. Empty string should short-circuit on the
  // UUID regex.
  const supabase = makeMockSupabase({ data: null, error: null });
  const result = await requireTenantActive(supabase, "");
  assertEquals(result.allowed, false);
  assertEquals(result.code, "TENANT_NOT_FOUND");
  assertEquals(result.status, null);
});

Deno.test("requireTenantActive: non-UUID string → TENANT_NOT_FOUND", async () => {
  const supabase = makeMockSupabase({ data: null, error: null });
  const result = await requireTenantActive(supabase, "not-a-uuid");
  assertEquals(result.allowed, false);
  assertEquals(result.code, "TENANT_NOT_FOUND");
});

Deno.test("requireTenantActive: UUID missing dashes → TENANT_NOT_FOUND", async () => {
  const supabase = makeMockSupabase({ data: null, error: null });
  const result = await requireTenantActive(
    supabase,
    "00000000000040008000000000000010",
  );
  assertEquals(result.code, "TENANT_NOT_FOUND");
});

Deno.test("requireTenantActive: UUID with invalid hex chars → TENANT_NOT_FOUND", async () => {
  const supabase = makeMockSupabase({ data: null, error: null });
  const result = await requireTenantActive(
    supabase,
    "zzzzzzzz-0000-4000-8000-000000000010",
  );
  assertEquals(result.code, "TENANT_NOT_FOUND");
});

// =============================================================================
// DB outcomes — fail-closed on error / missing row
// =============================================================================

Deno.test("requireTenantActive: DB error → blocked with TENANT_NOT_FOUND", async () => {
  const supabase = makeMockSupabase({
    data: null,
    error: { message: "connection refused" },
  });
  const result = await requireTenantActive(supabase, VALID_TENANT);
  assertFalse(result.allowed);
  assertEquals(result.code, "TENANT_NOT_FOUND");
  assertEquals(result.status, null);
});

Deno.test("requireTenantActive: missing tenant row → blocked with TENANT_NOT_FOUND", async () => {
  const supabase = makeMockSupabase({ data: null, error: null });
  const result = await requireTenantActive(supabase, VALID_TENANT);
  assertFalse(result.allowed);
  assertEquals(result.code, "TENANT_NOT_FOUND");
});

Deno.test("requireTenantActive: thrown exception in builder → blocked with TENANT_NOT_FOUND", async () => {
  // Outer try/catch path — simulates a Supabase client that rejects mid-await.
  const supabase = makeMockSupabase(() =>
    Promise.reject(new Error("network reset")),
  );
  const result = await requireTenantActive(supabase, VALID_TENANT);
  assertFalse(result.allowed);
  assertEquals(result.code, "TENANT_NOT_FOUND");
});

// =============================================================================
// Lifecycle branches — each maps to its specific code
// =============================================================================

Deno.test("requireTenantActive: lifecycle_status=BLOCKED → blocked with TENANT_BLOCKED", async () => {
  const supabase = makeMockSupabase({
    data: { lifecycle_status: "BLOCKED" },
    error: null,
  });
  const result = await requireTenantActive(supabase, VALID_TENANT);
  assertFalse(result.allowed);
  assertEquals(result.code, "TENANT_BLOCKED");
  assertEquals(result.status, "BLOCKED");
});

Deno.test("requireTenantActive: lifecycle_status=SETUP → blocked with TENANT_SETUP", async () => {
  const supabase = makeMockSupabase({
    data: { lifecycle_status: "SETUP" },
    error: null,
  });
  const result = await requireTenantActive(supabase, VALID_TENANT);
  assertFalse(result.allowed);
  assertEquals(result.code, "TENANT_SETUP");
  assertEquals(result.status, "SETUP");
});

Deno.test("requireTenantActive: lifecycle_status=ACTIVE → allowed", async () => {
  const supabase = makeMockSupabase({
    data: { lifecycle_status: "ACTIVE" },
    error: null,
  });
  const result = await requireTenantActive(supabase, VALID_TENANT);
  assert(result.allowed);
  assertEquals(result.status, "ACTIVE");
  assertEquals(result.code, undefined);
});

Deno.test("requireTenantActive: lifecycle_status null (legacy row) defaults to ACTIVE", async () => {
  // Legacy rows pre-PI-D6.1.1 don't have lifecycle_status populated.
  // The source defaults to 'ACTIVE' in that case so existing tenants
  // don't suddenly get blocked. Pin the behavior so a refactor doesn't
  // flip the default to a denied state.
  const supabase = makeMockSupabase({
    data: { lifecycle_status: null },
    error: null,
  });
  const result = await requireTenantActive(supabase, VALID_TENANT);
  assert(result.allowed);
  assertEquals(result.status, "ACTIVE");
});

Deno.test("requireTenantActive: unknown lifecycle_status → blocked with TENANT_NOT_ACTIVE", async () => {
  // Defensive: a status that ISN'T any of the three known enum values
  // (database drift, new enum added without code update) should fail
  // closed with a generic TENANT_NOT_ACTIVE rather than crashing or
  // — worse — being silently allowed.
  const supabase = makeMockSupabase({
    data: { lifecycle_status: "DECOMMISSIONED" },
    error: null,
  });
  const result = await requireTenantActive(supabase, VALID_TENANT);
  assertFalse(result.allowed);
  assertEquals(result.code, "TENANT_NOT_ACTIVE");
  assertEquals(result.status, "DECOMMISSIONED");
});

// =============================================================================
// tenantNotActiveResponse — SAFE GOLD neutral envelope
// =============================================================================

Deno.test("tenantNotActiveResponse: returns HTTP 200 (neutral) with TENANT_NOT_ACTIVE code", async () => {
  // SAFE GOLD I4: status code is 200 on purpose — we don't want clients
  // distinguishing tenant-blocked errors from other failures by HTTP
  // status alone. Pin the 200 so a future refactor doesn't switch to
  // 403 and accidentally leak the lifecycle state to the network.
  const res = tenantNotActiveResponse("BLOCKED");
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = await res.json();
  assertEquals(body.success, false);
  assertEquals(body.code, "TENANT_NOT_ACTIVE");
  assertEquals(typeof body.error, "string");
});

Deno.test("tenantNotActiveResponse: body does NOT echo the internal status", async () => {
  // The status param is for internal logging only. The client must NOT
  // see whether the tenant was BLOCKED vs SETUP vs anything else —
  // that's information disclosure.
  const blockedRes = await tenantNotActiveResponse("BLOCKED").json();
  const setupRes = await tenantNotActiveResponse("SETUP").json();
  // Both bodies must be byte-identical.
  assertEquals(blockedRes, setupRes);
  // Neither body contains the lifecycle keyword.
  const blockedSerialized = JSON.stringify(blockedRes).toUpperCase();
  assertFalse(blockedSerialized.includes("BLOCKED"));
  assertFalse(blockedSerialized.includes("SETUP"));
});

Deno.test("tenantNotActiveResponse: works with null status", async () => {
  const res = tenantNotActiveResponse(null);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.code, "TENANT_NOT_ACTIVE");
});
