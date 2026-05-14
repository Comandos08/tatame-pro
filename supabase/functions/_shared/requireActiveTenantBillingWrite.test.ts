/**
 * Contract tests for requireActiveTenantBillingWrite.
 *
 * This is the combined Tenant + Billing write gate. Every privileged
 * domain operation (event creation, membership write, ranking update,
 * etc.) is supposed to pass through it. A regression here is one of:
 *   - allows a write on a non-ACTIVE tenant or a tenant with a billing
 *     hard-block (revenue + integrity violation),
 *   - blocks a paying-active tenant (legit operator locked out),
 *   - skips the audit event on either decision (LGPD/SOC trail breaks —
 *     we lose the evidence that the gate fired at all).
 *
 * The audit trail invariant is non-obvious in the source (audit is
 * "fire-and-forget" via emitBillingAuditEvent and a regression would
 * be silent in production), so it's pinned explicitly here for every
 * decision branch: ALLOWED, TENANT_NOT_ACTIVE_BLOCK, BILLING_BLOCKED,
 * BILLING_READ_ONLY_BLOCK, BILLING_WRITE_BLOCKED.
 *
 * HTTP status mapping is also pinned per spec:
 *   404 TENANT_NOT_FOUND | 409 TENANT_NOT_ACTIVE | 402 BILLING_BLOCKED
 *   423 BILLING_READ_ONLY | 500 *_CHECK_ERROR / INTERNAL_ERROR
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireActiveTenantBillingWrite } from "./requireActiveTenantBillingWrite.ts";

// =============================================================================
// Mock supabase — read queues per table + records insert payloads
// =============================================================================
// requireActiveTenantBillingWrite touches:
//   .from('tenants').select.eq.maybeSingle()           → tenant lookup
//   .from('tenant_billing').select.eq.maybeSingle()    → via requireBillingStatus
//   .from('audit_logs').insert(payload)                → via emitBillingAuditEvent
//
// The audit insert never affects the gate's return value (best-effort)
// but we capture every payload so tests can verify it ran with the
// right event_type/decision.

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface InsertRecord {
  table: string;
  payload: Record<string, unknown>;
}

interface MockOpts {
  tenants?: QueryResult[];
  tenant_billing?: QueryResult[];
  /** If set, audit_logs.insert resolves with this error; default null. */
  auditError?: unknown;
}

function makeMockSupabase(opts: MockOpts = {}) {
  const cursors: Record<string, number> = {};
  const inserts: InsertRecord[] = [];

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
      maybeSingle: () => promise,
      then: promise.then.bind(promise),
    };
    return b;
  }

  return {
    client: {
      from: (table: string) => ({
        select: () => readBuilder(table),
        insert: (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return Promise.resolve({
            data: null,
            error: opts.auditError ?? null,
          });
        },
      }),
      // deno-lint-ignore no-explicit-any
    } as any,
    inserts,
  };
}

const TENANT = "00000000-0000-4000-8000-000000000010";
const USER = "00000000-0000-4000-8000-000000000020";

function baseParams() {
  return {
    tenantId: TENANT,
    userId: USER,
    domain: "EVENTS" as const,
    operation: "create",
  };
}

// =============================================================================
// STEP 1+2 — Tenant fetch error / not found
// =============================================================================

Deno.test("requireActiveTenantBillingWrite: tenant fetch error → 500 TENANT_FETCH_ERROR, no audit", async () => {
  const mock = makeMockSupabase({
    tenants: [{ data: null, error: { message: "connection refused" } }],
  });
  const result = await requireActiveTenantBillingWrite({
    supabase: mock.client,
    ...baseParams(),
  });
  assertEquals(result.ok, false);
  assertEquals(result.httpStatus, 500);
  assertEquals(result.code, "TENANT_FETCH_ERROR");
  // Audit not invoked — we never made a decision, just failed the lookup.
  assertEquals(mock.inserts.length, 0);
});

Deno.test("requireActiveTenantBillingWrite: tenant not found → 404 TENANT_NOT_FOUND, no audit", async () => {
  const mock = makeMockSupabase({
    tenants: [{ data: null, error: null }],
  });
  const result = await requireActiveTenantBillingWrite({
    supabase: mock.client,
    ...baseParams(),
  });
  assertEquals(result.ok, false);
  assertEquals(result.httpStatus, 404);
  assertEquals(result.code, "TENANT_NOT_FOUND");
  assertEquals(mock.inserts.length, 0);
});

// =============================================================================
// STEP 3 — Tenant exists but not ACTIVE → 409 + audited
// =============================================================================

Deno.test("requireActiveTenantBillingWrite: tenant.status=SUSPENDED → 409 TENANT_NOT_ACTIVE + audit fired", async () => {
  const mock = makeMockSupabase({
    tenants: [{ data: { id: TENANT, status: "SUSPENDED" }, error: null }],
  });
  const result = await requireActiveTenantBillingWrite({
    supabase: mock.client,
    ...baseParams(),
  });
  assertEquals(result.ok, false);
  assertEquals(result.httpStatus, 409);
  assertEquals(result.code, "TENANT_NOT_ACTIVE");
  assertEquals(result.tenantStatus, "SUSPENDED");

  // Audit invariant: the gate logs the BLOCKED decision so the trail
  // captures it.
  assertEquals(mock.inserts.length, 1);
  assertEquals(mock.inserts[0].table, "audit_logs");
  assertEquals(mock.inserts[0].payload.event_type, "TENANT_NOT_ACTIVE_BLOCK");
  const meta = mock.inserts[0].payload.metadata as Record<string, unknown>;
  assertEquals(meta.decision, "BLOCKED");
  assertEquals(meta.tenant_status, "SUSPENDED");
  assertEquals(meta.billing_block_reason, "TENANT_NOT_ACTIVE");
});

// =============================================================================
// STEP 4 — Billing check error / not found
// =============================================================================

Deno.test("requireActiveTenantBillingWrite: billing DB error → 500 BILLING_CHECK_ERROR, no audit", async () => {
  // requireBillingStatus returns code=BILLING_CHECK_ERROR. The outer
  // gate short-circuits without auditing — we couldn't even read the
  // billing state to log it.
  const mock = makeMockSupabase({
    tenants: [{ data: { id: TENANT, status: "ACTIVE" }, error: null }],
    tenant_billing: [{ data: null, error: { message: "db gone" } }],
  });
  const result = await requireActiveTenantBillingWrite({
    supabase: mock.client,
    ...baseParams(),
  });
  assertEquals(result.ok, false);
  assertEquals(result.httpStatus, 500);
  assertEquals(result.code, "BILLING_CHECK_ERROR");
  // No audit — same rationale as TENANT_FETCH_ERROR above.
  assertEquals(mock.inserts.length, 0);
});

Deno.test("requireActiveTenantBillingWrite: billing row missing → 402 BILLING_NOT_FOUND + audit fired", async () => {
  const mock = makeMockSupabase({
    tenants: [{ data: { id: TENANT, status: "ACTIVE" }, error: null }],
    tenant_billing: [{ data: null, error: null }],
  });
  const result = await requireActiveTenantBillingWrite({
    supabase: mock.client,
    ...baseParams(),
  });
  assertEquals(result.ok, false);
  assertEquals(result.httpStatus, 402);
  assertEquals(result.code, "BILLING_NOT_FOUND");

  assertEquals(mock.inserts.length, 1);
  assertEquals(mock.inserts[0].payload.event_type, "BILLING_BLOCKED");
  const meta = mock.inserts[0].payload.metadata as Record<string, unknown>;
  assertEquals(meta.decision, "BLOCKED");
  assertEquals(meta.billing_block_reason, "BILLING_NOT_FOUND");
});

// =============================================================================
// STEP 5 — Hard block (PENDING_DELETE, CANCELED) → 402 + audited
// =============================================================================

for (const blockedStatus of ["PENDING_DELETE", "CANCELED"] as const) {
  Deno.test(`requireActiveTenantBillingWrite: billing=${blockedStatus} → 402 BILLING_BLOCKED + audit fired`, async () => {
    const mock = makeMockSupabase({
      tenants: [{ data: { id: TENANT, status: "ACTIVE" }, error: null }],
      tenant_billing: [
        {
          data: { status: blockedStatus, is_manual_override: false },
          error: null,
        },
      ],
    });
    const result = await requireActiveTenantBillingWrite({
      supabase: mock.client,
      ...baseParams(),
    });
    assertEquals(result.ok, false);
    assertEquals(result.httpStatus, 402);
    assertEquals(result.code, "BILLING_BLOCKED");
    assertEquals(result.billingStatus, blockedStatus);

    assertEquals(mock.inserts.length, 1);
    assertEquals(mock.inserts[0].payload.event_type, "BILLING_BLOCKED");
    const meta = mock.inserts[0].payload.metadata as Record<string, unknown>;
    assertEquals(meta.decision, "BLOCKED");
    assertEquals(meta.billing_status, blockedStatus);
  });
}

// =============================================================================
// STEP 6 — Read-only block (TRIAL_EXPIRED, PAST_DUE) → 423 + audited
// =============================================================================

for (const readOnlyStatus of ["TRIAL_EXPIRED", "PAST_DUE"] as const) {
  Deno.test(`requireActiveTenantBillingWrite: billing=${readOnlyStatus} → 423 BILLING_READ_ONLY + audit fired`, async () => {
    const mock = makeMockSupabase({
      tenants: [{ data: { id: TENANT, status: "ACTIVE" }, error: null }],
      tenant_billing: [
        {
          data: { status: readOnlyStatus, is_manual_override: false },
          error: null,
        },
      ],
    });
    const result = await requireActiveTenantBillingWrite({
      supabase: mock.client,
      ...baseParams(),
    });
    assertEquals(result.ok, false);
    assertEquals(result.httpStatus, 423);
    assertEquals(result.code, "BILLING_READ_ONLY");
    assertEquals(result.billingStatus, readOnlyStatus);

    assertEquals(mock.inserts.length, 1);
    assertEquals(
      mock.inserts[0].payload.event_type,
      "BILLING_READ_ONLY_BLOCK",
    );
    const meta = mock.inserts[0].payload.metadata as Record<string, unknown>;
    assertEquals(meta.decision, "BLOCKED");
    assertEquals(meta.billing_block_reason, "BILLING_READ_ONLY");
  });
}

Deno.test("requireActiveTenantBillingWrite: PAST_DUE + manual override → bypasses read-only, hits SUCCESS path", async () => {
  // Manual override is the support escape hatch. The READ_ONLY check
  // explicitly respects `billingCheck.isManualOverride === true`.
  // requireBillingStatus already short-circuits to allowed=true, so the
  // gate proceeds straight to the SUCCESS audit + ok=true.
  const mock = makeMockSupabase({
    tenants: [{ data: { id: TENANT, status: "ACTIVE" }, error: null }],
    tenant_billing: [
      { data: { status: "PAST_DUE", is_manual_override: true }, error: null },
    ],
  });
  const result = await requireActiveTenantBillingWrite({
    supabase: mock.client,
    ...baseParams(),
  });
  assert(result.ok);
  assertEquals(result.billingStatus, "PAST_DUE");
  // The SUCCESS audit is what we expect — not a BILLING_READ_ONLY_BLOCK.
  assertEquals(mock.inserts[0].payload.event_type, "BILLING_WRITE_ALLOWED");
});

// =============================================================================
// STEP 7 — Other restricted statuses (UNPAID, INCOMPLETE) → 402 + audited
// =============================================================================

for (const otherRestricted of ["UNPAID", "INCOMPLETE"] as const) {
  Deno.test(`requireActiveTenantBillingWrite: billing=${otherRestricted} → 402 BILLING_BLOCKED via WRITE_BLOCKED audit`, async () => {
    // These statuses are NOT in BLOCKED_STATUSES nor READ_ONLY_STATUSES,
    // but requireBillingStatus rejects them (only ACTIVE/TRIALING pass).
    // The gate falls through to Step 7 and audits BILLING_WRITE_BLOCKED.
    const mock = makeMockSupabase({
      tenants: [{ data: { id: TENANT, status: "ACTIVE" }, error: null }],
      tenant_billing: [
        {
          data: { status: otherRestricted, is_manual_override: false },
          error: null,
        },
      ],
    });
    const result = await requireActiveTenantBillingWrite({
      supabase: mock.client,
      ...baseParams(),
    });
    assertEquals(result.ok, false);
    assertEquals(result.httpStatus, 402);
    assertEquals(result.code, "BILLING_BLOCKED");
    assertEquals(result.billingStatus, otherRestricted);

    assertEquals(
      mock.inserts[0].payload.event_type,
      "BILLING_WRITE_BLOCKED",
    );
  });
}

// =============================================================================
// SUCCESS — ACTIVE tenant + ACTIVE/TRIALING billing → ok + audited
// =============================================================================

for (const okStatus of ["ACTIVE", "TRIALING"] as const) {
  Deno.test(`requireActiveTenantBillingWrite: tenant=ACTIVE + billing=${okStatus} → ok=true + AUDIT_ALLOWED`, async () => {
    const mock = makeMockSupabase({
      tenants: [{ data: { id: TENANT, status: "ACTIVE" }, error: null }],
      tenant_billing: [
        { data: { status: okStatus, is_manual_override: false }, error: null },
      ],
    });
    const result = await requireActiveTenantBillingWrite({
      supabase: mock.client,
      ...baseParams(),
    });
    assert(result.ok);
    assertEquals(result.tenantStatus, "ACTIVE");
    assertEquals(result.billingStatus, okStatus);
    // Should NOT have httpStatus on success — only failures carry it.
    assertEquals(result.httpStatus, undefined);

    // Audit invariant: success path also writes an audit row.
    assertEquals(mock.inserts.length, 1);
    assertEquals(mock.inserts[0].payload.event_type, "BILLING_WRITE_ALLOWED");
    const meta = mock.inserts[0].payload.metadata as Record<string, unknown>;
    assertEquals(meta.decision, "ALLOWED");
    assertEquals(meta.tenant_status, "ACTIVE");
    assertEquals(meta.billing_status, okStatus);
    assertEquals(meta.domain, "EVENTS");
    assertEquals(meta.operation, "create");
  });
}

// =============================================================================
// Audit failure is best-effort — must not propagate to caller
// =============================================================================

Deno.test("requireActiveTenantBillingWrite: audit insert error does NOT change the decision", async () => {
  // emitBillingAuditEvent swallows insert errors by contract. Pin that
  // the gate still returns ok=true on a happy path even when the audit
  // write fails — the caller should not be coupled to audit availability.
  const mock = makeMockSupabase({
    tenants: [{ data: { id: TENANT, status: "ACTIVE" }, error: null }],
    tenant_billing: [
      { data: { status: "ACTIVE", is_manual_override: false }, error: null },
    ],
    auditError: { message: "audit table full" },
  });
  const result = await requireActiveTenantBillingWrite({
    supabase: mock.client,
    ...baseParams(),
  });
  assert(result.ok);
  // Insert was still attempted.
  assertEquals(mock.inserts.length, 1);
});

// =============================================================================
// Domain / operation propagation into the audit payload
// =============================================================================

Deno.test("requireActiveTenantBillingWrite: domain + operation are propagated into the audit metadata", async () => {
  const mock = makeMockSupabase({
    tenants: [{ data: { id: TENANT, status: "ACTIVE" }, error: null }],
    tenant_billing: [
      { data: { status: "ACTIVE", is_manual_override: false }, error: null },
    ],
  });
  await requireActiveTenantBillingWrite({
    supabase: mock.client,
    tenantId: TENANT,
    userId: USER,
    domain: "RANKINGS",
    operation: "publish",
  });
  const meta = mock.inserts[0].payload.metadata as Record<string, unknown>;
  assertEquals(meta.domain, "RANKINGS");
  assertEquals(meta.operation, "publish");
});

Deno.test("requireActiveTenantBillingWrite: null userId is preserved in the audit row", async () => {
  // Some callers (cron jobs) don't have a userId — null must pass through
  // to profile_id in the audit row.
  const mock = makeMockSupabase({
    tenants: [{ data: { id: TENANT, status: "ACTIVE" }, error: null }],
    tenant_billing: [
      { data: { status: "ACTIVE", is_manual_override: false }, error: null },
    ],
  });
  await requireActiveTenantBillingWrite({
    supabase: mock.client,
    tenantId: TENANT,
    userId: null,
    domain: "EVENTS",
    operation: "create",
  });
  assertEquals(mock.inserts[0].payload.profile_id, null);
});
