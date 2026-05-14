/**
 * Contract tests for requireTenantRole + requireGlobalSuperadmin.
 *
 * Every Edge Function that mutates tenant-scoped data sits behind this
 * helper. A regression flips one of two failure modes:
 *   - allows a request that lacks the required role (cross-tenant write,
 *     privilege escalation), or
 *   - blocks a legit caller (operator can't approve a membership).
 *
 * The function deliberately deny-by-default: any error path returns
 * { allowed: false }. We pin every branch in the source — header parsing,
 * token validation, SUPERADMIN_GLOBAL short-circuit, per-tenant role
 * intersection — plus the response helpers' institutional envelope shape.
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  requireTenantRole,
  requireGlobalSuperadmin,
  forbiddenResponse,
  unauthorizedResponse,
  type EdgeAppRole,
} from "./requireTenantRole.ts";

// =============================================================================
// Builder mock — queues per-table results in FIFO order
// =============================================================================
// requireTenantRole issues up to two queries to `user_roles`:
//   1. SUPERADMIN_GLOBAL check (.eq.eq.is.maybeSingle)
//   2. per-tenant role list (.eq.eq → resolved array)
// The thenable returns the next queued result for the table on every chain
// call so callers can stop the chain at any point.

interface QueryResult {
  data: unknown;
  error: unknown;
}

function makeBuilder(result: QueryResult) {
  const promise = Promise.resolve(result);
  // deno-lint-ignore no-explicit-any
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    maybeSingle: () => promise,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
  return builder;
}

interface MockOpts {
  authUser?: { id: string } | null;
  authError?: unknown;
  user_roles?: QueryResult[];
}

function makeMockSupabase(opts: MockOpts = {}) {
  const cursors: Record<string, number> = {};
  return {
    auth: {
      getUser: (_token: string) =>
        Promise.resolve({
          data: { user: opts.authUser ?? null },
          error: opts.authError ?? null,
        }),
    },
    from: (table: string) => {
      const q = (opts as Record<string, QueryResult[]>)[table] ?? [];
      const idx = cursors[table] ?? 0;
      const result = q[idx] ?? { data: null, error: null };
      cursors[table] = idx + 1;
      return makeBuilder(result);
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

const USER = "00000000-0000-4000-8000-000000000010";
const TENANT = "00000000-0000-4000-8000-000000000020";

// =============================================================================
// Auth header parsing — fail-closed before any DB call
// =============================================================================

Deno.test("requireTenantRole: null auth header → not allowed", async () => {
  const supabase = makeMockSupabase();
  const result = await requireTenantRole(supabase, null, TENANT, ["ADMIN_TENANT"]);
  assertEquals(result.allowed, false);
  assertEquals(result.userId, null);
  assert(result.error?.includes("Authorization"));
});

Deno.test("requireTenantRole: non-Bearer header → not allowed", async () => {
  const supabase = makeMockSupabase();
  const result = await requireTenantRole(
    supabase,
    "Basic dXNlcjpwYXNz",
    TENANT,
    ["ADMIN_TENANT"],
  );
  assertEquals(result.allowed, false);
});

Deno.test("requireTenantRole: empty Bearer (no token) → still parsed, hits auth.getUser", async () => {
  // 'Bearer ' alone still satisfies startsWith. The downstream
  // supabase.auth.getUser('') is what rejects it. Pin the boundary so
  // callers don't accidentally allow a 'Bearer ' literal.
  const supabase = makeMockSupabase({ authError: { message: "no jwt" }, authUser: null });
  const result = await requireTenantRole(supabase, "Bearer ", TENANT, ["ADMIN_TENANT"]);
  assertEquals(result.allowed, false);
  assertEquals(result.error, "Invalid or expired token");
});

// =============================================================================
// Token validation
// =============================================================================

Deno.test("requireTenantRole: invalid token (authError) → not allowed", async () => {
  const supabase = makeMockSupabase({
    authError: { message: "JWT expired" },
    authUser: null,
  });
  const result = await requireTenantRole(
    supabase,
    "Bearer expired-jwt",
    TENANT,
    ["ADMIN_TENANT"],
  );
  assertEquals(result.allowed, false);
  assertEquals(result.userId, null);
  assertEquals(result.error, "Invalid or expired token");
});

Deno.test("requireTenantRole: null user (no authError) → not allowed", async () => {
  const supabase = makeMockSupabase({ authUser: null, authError: null });
  const result = await requireTenantRole(
    supabase,
    "Bearer tkn",
    TENANT,
    ["ADMIN_TENANT"],
  );
  assertEquals(result.allowed, false);
});

// =============================================================================
// SUPERADMIN_GLOBAL short-circuit
// =============================================================================

Deno.test("requireTenantRole: SUPERADMIN_GLOBAL bypasses per-tenant check", async () => {
  const supabase = makeMockSupabase({
    authUser: { id: USER },
    user_roles: [
      { data: { id: "global-role-row" }, error: null }, // global check hits
    ],
  });
  const result = await requireTenantRole(
    supabase,
    "Bearer tkn",
    TENANT,
    ["ADMIN_TENANT"], // SUPERADMIN_GLOBAL is NOT in the allowed list
  );
  assertEquals(result.allowed, true);
  assertEquals(result.userId, USER);
  assertEquals(result.isGlobalSuperadmin, true);
  assertEquals(result.roles, ["SUPERADMIN_GLOBAL"]);
});

// =============================================================================
// Per-tenant role intersection
// =============================================================================

Deno.test("requireTenantRole: user with allowed role → allowed", async () => {
  const supabase = makeMockSupabase({
    authUser: { id: USER },
    user_roles: [
      { data: null, error: null }, // not superadmin
      { data: [{ role: "ADMIN_TENANT" }], error: null },
    ],
  });
  const result = await requireTenantRole(
    supabase,
    "Bearer tkn",
    TENANT,
    ["ADMIN_TENANT"],
  );
  assertEquals(result.allowed, true);
  assertEquals(result.userId, USER);
  assertEquals(result.roles, ["ADMIN_TENANT"]);
  assertEquals(result.isGlobalSuperadmin, false);
});

Deno.test("requireTenantRole: user with ATLETA role NOT in allowlist → not allowed", async () => {
  const supabase = makeMockSupabase({
    authUser: { id: USER },
    user_roles: [
      { data: null, error: null },
      { data: [{ role: "ATLETA" }], error: null },
    ],
  });
  const result = await requireTenantRole(
    supabase,
    "Bearer tkn",
    TENANT,
    ["ADMIN_TENANT"],
  );
  assertEquals(result.allowed, false);
  assertEquals(result.userId, USER);
  assertEquals(result.roles, ["ATLETA"]);
  assert(result.error?.includes("ATLETA"));
  assert(result.error?.includes("ADMIN_TENANT"));
});

Deno.test("requireTenantRole: empty role list → not allowed", async () => {
  // User exists but has no role in this tenant — cross-tenant guard:
  // ADMIN of tenant A should NOT be allowed to act on tenant B.
  const supabase = makeMockSupabase({
    authUser: { id: USER },
    user_roles: [
      { data: null, error: null },
      { data: [], error: null },
    ],
  });
  const result = await requireTenantRole(
    supabase,
    "Bearer tkn",
    TENANT,
    ["ADMIN_TENANT"],
  );
  assertEquals(result.allowed, false);
  assertEquals(result.roles, []);
});

Deno.test("requireTenantRole: roles DB error → deny with userId preserved", async () => {
  const supabase = makeMockSupabase({
    authUser: { id: USER },
    user_roles: [
      { data: null, error: null }, // global check ok (not superadmin)
      { data: null, error: { message: "permission denied" } }, // roles query errored
    ],
  });
  const result = await requireTenantRole(
    supabase,
    "Bearer tkn",
    TENANT,
    ["ADMIN_TENANT"],
  );
  assertEquals(result.allowed, false);
  assertEquals(result.userId, USER); // preserved for audit logging
  assertEquals(result.error, "Error fetching roles");
});

Deno.test("requireTenantRole: user with multiple roles, at least one allowed → allowed", async () => {
  const supabase = makeMockSupabase({
    authUser: { id: USER },
    user_roles: [
      { data: null, error: null },
      { data: [{ role: "ATLETA" }, { role: "ADMIN_TENANT" }], error: null },
    ],
  });
  const allowed: EdgeAppRole[] = ["ADMIN_TENANT"];
  const result = await requireTenantRole(supabase, "Bearer tkn", TENANT, allowed);
  assertEquals(result.allowed, true);
  assertEquals(result.roles.length, 2);
});

// =============================================================================
// requireGlobalSuperadmin
// =============================================================================

Deno.test("requireGlobalSuperadmin: null auth → not allowed", async () => {
  const supabase = makeMockSupabase();
  const result = await requireGlobalSuperadmin(supabase, null);
  assertEquals(result.allowed, false);
  assertEquals(result.userId, null);
});

Deno.test("requireGlobalSuperadmin: valid token + global role → allowed", async () => {
  const supabase = makeMockSupabase({
    authUser: { id: USER },
    user_roles: [{ data: { id: "row" }, error: null }],
  });
  const result = await requireGlobalSuperadmin(supabase, "Bearer tkn");
  assertEquals(result.allowed, true);
  assertEquals(result.userId, USER);
});

Deno.test("requireGlobalSuperadmin: valid token but no global role → not allowed, userId preserved", async () => {
  const supabase = makeMockSupabase({
    authUser: { id: USER },
    user_roles: [{ data: null, error: null }],
  });
  const result = await requireGlobalSuperadmin(supabase, "Bearer tkn");
  assertEquals(result.allowed, false);
  assertEquals(result.userId, USER); // audit can still attribute the attempt
});

Deno.test("requireGlobalSuperadmin: auth error → not allowed", async () => {
  const supabase = makeMockSupabase({
    authError: { message: "expired" },
    authUser: null,
  });
  const result = await requireGlobalSuperadmin(supabase, "Bearer tkn");
  assertEquals(result.allowed, false);
});

// =============================================================================
// Response helpers — institutional envelope
// =============================================================================

Deno.test("forbiddenResponse: returns 403 with FORBIDDEN code + canonical messageKey", async () => {
  const res = forbiddenResponse();
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.ok, false);
  assertEquals(body.code, "FORBIDDEN");
  assertEquals(body.messageKey, "auth.operation_not_permitted");
  assertEquals(body.retryable, false);
  assertEquals(typeof body.timestamp, "string");
  // 'Forbidden' is the default so no `details` is attached.
  assertEquals(body.details, undefined);
});

Deno.test("forbiddenResponse: custom message attaches `details`", async () => {
  const res = forbiddenResponse("requires ADMIN_TENANT");
  const body = await res.json();
  assertEquals(body.details, ["requires ADMIN_TENANT"]);
});

Deno.test("unauthorizedResponse: returns 401 with UNAUTHORIZED code + invalid_token messageKey", async () => {
  const res = unauthorizedResponse();
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.code, "UNAUTHORIZED");
  assertEquals(body.messageKey, "auth.invalid_token");
  assertEquals(body.retryable, false);
});

Deno.test("unauthorizedResponse: custom message attaches `details`", async () => {
  const res = unauthorizedResponse("JWT expired");
  const body = await res.json();
  assertEquals(body.details, ["JWT expired"]);
});
