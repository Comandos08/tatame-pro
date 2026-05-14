/**
 * Contract tests for requireImpersonationIfSuperadmin + extractImpersonationId.
 *
 * SUPERADMIN_GLOBAL is the only role that crosses tenant boundaries; the
 * impersonation envelope is what keeps a curious or compromised superadmin
 * from quietly mutating arbitrary tenants. A regression in this helper has
 * two failure modes:
 *   - allows a superadmin write WITHOUT a valid impersonation envelope
 *     (cross-tenant breach), or
 *   - rejects a legit tenant-admin (operator locked out of routine work).
 *
 * We pin: superadmin detection, the "no impersonation" deny, expired /
 * wrong-owner / wrong-tenant rejects, the auto-expire side effect, and the
 * normal-role short-circuit.
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  requireImpersonationIfSuperadmin,
  extractImpersonationId,
} from "./requireImpersonationIfSuperadmin.ts";

// =============================================================================
// Mock supabase — queues per-table results + records update payloads
// =============================================================================
// The helper issues:
//   1. .from('user_roles').select.eq.is.eq.maybeSingle()      → superadmin probe
//   2. .from('superadmin_impersonations').select.eq.maybeSingle() → session
//   3. .from('superadmin_impersonations').update(...).eq(...)  → auto-expire
//      (fire-and-forget but awaited inside the function body)

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface UpdateRecord {
  table: string;
  payload: Record<string, unknown>;
}

interface MockOpts {
  user_roles?: QueryResult[];
  superadmin_impersonations?: QueryResult[];
}

function makeMockSupabase(opts: MockOpts = {}) {
  const cursors: Record<string, number> = {};
  const updates: UpdateRecord[] = [];

  function readBuilder(table: string) {
    const q = (opts as Record<string, QueryResult[]>)[table] ?? [];
    const idx = cursors[table] ?? 0;
    const result = q[idx] ?? { data: null, error: null };
    cursors[table] = idx + 1;
    const promise = Promise.resolve(result);
    // deno-lint-ignore no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b,
      is: () => b,
      maybeSingle: () => promise,
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
    };
    return b;
  }

  function updateBuilder(table: string, payload: Record<string, unknown>) {
    updates.push({ table, payload });
    const promise = Promise.resolve({ data: null, error: null });
    // deno-lint-ignore no-explicit-any
    const b: any = {
      eq: () => b,
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
    };
    return b;
  }

  return {
    client: {
      // `.from(table)` returns an object that branches on `.select()` (reads
      // — consumes one queued result for the table) vs `.update()` (writes
      // — recorded in `updates` for assertion).
      from: (table: string) => ({
        select: () => readBuilder(table),
        update: (payload: Record<string, unknown>) =>
          updateBuilder(table, payload),
      }),
      // deno-lint-ignore no-explicit-any
    } as any,
    updates,
  };
}

const USER = "00000000-0000-4000-8000-000000000010";
const OTHER_USER = "00000000-0000-4000-8000-000000000099";
const TENANT = "00000000-0000-4000-8000-000000000020";
const OTHER_TENANT = "00000000-0000-4000-8000-000000000021";
const IMP_ID = "imp-session-1";

function isoFuture(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}
function isoPast(): string {
  return new Date(Date.now() - 60 * 1000).toISOString();
}

// =============================================================================
// Non-superadmin path — short-circuit to valid + isSuperadmin=false
// =============================================================================

Deno.test("requireImpersonationIfSuperadmin: non-superadmin → valid=true, isSuperadmin=false", async () => {
  const { client } = makeMockSupabase({
    user_roles: [{ data: null, error: null }], // not a superadmin
  });
  const result = await requireImpersonationIfSuperadmin(
    client,
    USER,
    TENANT,
    null,
  );
  assertEquals(result, { valid: true, isSuperadmin: false });
});

Deno.test("requireImpersonationIfSuperadmin: role check error → blocked, isSuperadmin=false", async () => {
  const { client } = makeMockSupabase({
    user_roles: [{ data: null, error: { message: "db down" } }],
  });
  const result = await requireImpersonationIfSuperadmin(
    client,
    USER,
    TENANT,
    IMP_ID,
  );
  assertEquals(result.valid, false);
  assertEquals(result.isSuperadmin, false);
  assertEquals(result.error, "Failed to verify role");
});

// =============================================================================
// Superadmin without impersonation — must be blocked
// =============================================================================

Deno.test("requireImpersonationIfSuperadmin: superadmin without impersonation → blocked", async () => {
  const { client } = makeMockSupabase({
    user_roles: [{ data: { id: "row" }, error: null }],
  });
  const result = await requireImpersonationIfSuperadmin(client, USER, TENANT, null);
  assertEquals(result.valid, false);
  assertEquals(result.isSuperadmin, true);
  assert(result.error?.includes("impersonation"));
});

Deno.test("requireImpersonationIfSuperadmin: superadmin with empty-string impersonation is treated like missing", async () => {
  const { client } = makeMockSupabase({
    user_roles: [{ data: { id: "row" }, error: null }],
  });
  const result = await requireImpersonationIfSuperadmin(client, USER, TENANT, "");
  assertEquals(result.valid, false);
  assertEquals(result.isSuperadmin, true);
});

// =============================================================================
// Impersonation session lookup
// =============================================================================

Deno.test("requireImpersonationIfSuperadmin: session not found → blocked", async () => {
  const { client } = makeMockSupabase({
    user_roles: [{ data: { id: "row" }, error: null }],
    superadmin_impersonations: [{ data: null, error: null }],
  });
  const result = await requireImpersonationIfSuperadmin(client, USER, TENANT, IMP_ID);
  assertEquals(result.valid, false);
  assertEquals(result.error, "Invalid impersonation session");
});

Deno.test("requireImpersonationIfSuperadmin: session DB error → blocked", async () => {
  const { client } = makeMockSupabase({
    user_roles: [{ data: { id: "row" }, error: null }],
    superadmin_impersonations: [{ data: null, error: { message: "db gone" } }],
  });
  const result = await requireImpersonationIfSuperadmin(client, USER, TENANT, IMP_ID);
  assertEquals(result.valid, false);
  assertEquals(result.error, "Invalid impersonation session");
});

Deno.test("requireImpersonationIfSuperadmin: session owned by another user → blocked", async () => {
  const { client } = makeMockSupabase({
    user_roles: [{ data: { id: "row" }, error: null }],
    superadmin_impersonations: [
      {
        data: {
          id: IMP_ID,
          superadmin_user_id: OTHER_USER,
          target_tenant_id: TENANT,
          status: "ACTIVE",
          expires_at: isoFuture(),
        },
        error: null,
      },
    ],
  });
  const result = await requireImpersonationIfSuperadmin(client, USER, TENANT, IMP_ID);
  assertEquals(result.valid, false);
  assert(result.error?.includes("another user"));
});

Deno.test("requireImpersonationIfSuperadmin: non-ACTIVE session → blocked, status surfaced", async () => {
  const { client } = makeMockSupabase({
    user_roles: [{ data: { id: "row" }, error: null }],
    superadmin_impersonations: [
      {
        data: {
          id: IMP_ID,
          superadmin_user_id: USER,
          target_tenant_id: TENANT,
          status: "REVOKED",
          expires_at: isoFuture(),
        },
        error: null,
      },
    ],
  });
  const result = await requireImpersonationIfSuperadmin(client, USER, TENANT, IMP_ID);
  assertEquals(result.valid, false);
  assert(result.error?.includes("REVOKED"));
});

Deno.test("requireImpersonationIfSuperadmin: expired session → blocked + auto-expire fires", async () => {
  // The auto-expire writes a row to superadmin_impersonations (UPDATE).
  // We capture the payload to confirm the helper actually persists the
  // EXPIRED state — otherwise a stale session lingers as ACTIVE.
  const mock = makeMockSupabase({
    user_roles: [{ data: { id: "row" }, error: null }],
    superadmin_impersonations: [
      {
        data: {
          id: IMP_ID,
          superadmin_user_id: USER,
          target_tenant_id: TENANT,
          status: "ACTIVE",
          expires_at: isoPast(),
        },
        error: null,
      },
    ],
  });
  const result = await requireImpersonationIfSuperadmin(
    mock.client,
    USER,
    TENANT,
    IMP_ID,
  );
  assertEquals(result.valid, false);
  assert(result.error?.includes("expired"));
  assertEquals(mock.updates.length, 1);
  assertEquals(mock.updates[0].table, "superadmin_impersonations");
  assertEquals(mock.updates[0].payload.status, "EXPIRED");
  assertEquals(typeof mock.updates[0].payload.ended_at, "string");
});

Deno.test("requireImpersonationIfSuperadmin: tenant mismatch → blocked", async () => {
  const { client } = makeMockSupabase({
    user_roles: [{ data: { id: "row" }, error: null }],
    superadmin_impersonations: [
      {
        data: {
          id: IMP_ID,
          superadmin_user_id: USER,
          target_tenant_id: OTHER_TENANT,
          status: "ACTIVE",
          expires_at: isoFuture(),
        },
        error: null,
      },
    ],
  });
  const result = await requireImpersonationIfSuperadmin(client, USER, TENANT, IMP_ID);
  assertEquals(result.valid, false);
  assert(result.error?.includes("different tenant"));
});

Deno.test("requireImpersonationIfSuperadmin: happy path — valid superadmin envelope", async () => {
  const { client } = makeMockSupabase({
    user_roles: [{ data: { id: "row" }, error: null }],
    superadmin_impersonations: [
      {
        data: {
          id: IMP_ID,
          superadmin_user_id: USER,
          target_tenant_id: TENANT,
          status: "ACTIVE",
          expires_at: isoFuture(),
        },
        error: null,
      },
    ],
  });
  const result = await requireImpersonationIfSuperadmin(client, USER, TENANT, IMP_ID);
  assertEquals(result, {
    valid: true,
    isSuperadmin: true,
    impersonationId: IMP_ID,
  });
});

// =============================================================================
// extractImpersonationId — header / body precedence
// =============================================================================

function reqWith(headers: Record<string, string>): Request {
  return new Request("https://example.test/", { headers });
}

Deno.test("extractImpersonationId: header takes precedence", () => {
  const req = reqWith({ "x-impersonation-id": "imp-header" });
  const id = extractImpersonationId(req, { impersonationId: "imp-body" });
  assertEquals(id, "imp-header");
});

Deno.test("extractImpersonationId: header is trimmed", () => {
  const req = reqWith({ "x-impersonation-id": "  imp-with-spaces  " });
  assertEquals(extractImpersonationId(req), "imp-with-spaces");
});

Deno.test("extractImpersonationId: blank header falls back to body", () => {
  // Empty/whitespace-only header should not poison the lookup — the body
  // value is the legit fallback the auth-bridge clients send.
  const req = reqWith({ "x-impersonation-id": "   " });
  const id = extractImpersonationId(req, { impersonationId: "imp-body" });
  assertEquals(id, "imp-body");
});

Deno.test("extractImpersonationId: no header, no body → null", () => {
  const req = reqWith({});
  assertEquals(extractImpersonationId(req), null);
});

Deno.test("extractImpersonationId: body string is trimmed", () => {
  const req = reqWith({});
  const id = extractImpersonationId(req, { impersonationId: "  imp-body  " });
  assertEquals(id, "imp-body");
});

Deno.test("extractImpersonationId: ignores non-string body value", () => {
  const req = reqWith({});
  // deno-lint-ignore no-explicit-any
  const id = extractImpersonationId(req, { impersonationId: 123 as any });
  assertEquals(id, null);
});
