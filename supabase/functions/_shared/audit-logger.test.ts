/**
 * Contract tests for createAuditLog + createAuditLogBatch.
 *
 * audit-logger is the canonical wrapper that every Edge Function uses to
 * insert into public.audit_logs. The wrapper enforces:
 *   - PI-D5.A: federation/council events MUST carry the right metadata
 *   - P1.3 (LGPD): PII keys in metadata are masked via sanitizeAuditMetadata
 *   - Auto-category from event_type prefix
 *   - occurred_at defaulted to now if not provided
 *   - profile_id defaulted to null
 *   - Returns {success: false, error} on DB error or thrown exception
 *
 * A regression in any of those silently corrupts the audit trail — the
 * one place we cannot afford silent regressions because audit logs ARE
 * the evidence we'd use to detect other regressions later.
 *
 * Mock: a recording Supabase mock that captures every .insert() payload,
 * so assertions can inspect what would have been written to the DB.
 */
import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createAuditLog,
  createAuditLogBatch,
  AUDIT_EVENTS,
} from "./audit-logger.ts";

// =============================================================================
// Recording Supabase mock
// =============================================================================

interface InsertRecord {
  table: string;
  payload: Record<string, unknown>;
}

function makeRecordingSupabase(
  insertResult: { data: unknown; error: unknown } = { data: null, error: null },
) {
  const records: InsertRecord[] = [];
  // deno-lint-ignore no-explicit-any
  const client: any = {
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        records.push({ table, payload });
        return Promise.resolve(insertResult);
      },
    }),
  };
  return { client, records };
}

const VALID_TENANT = "00000000-0000-4000-8000-000000000002";

// =============================================================================
// createAuditLog — happy path + insert outcomes
// =============================================================================

Deno.test("createAuditLog: returns success on clean insert", async () => {
  const { client } = makeRecordingSupabase();
  const result = await createAuditLog(client, {
    event_type: AUDIT_EVENTS.MEMBERSHIP_CREATED,
    tenant_id: VALID_TENANT,
  });
  assertEquals(result.success, true);
  assertEquals(result.error, undefined);
});

Deno.test("createAuditLog: returns {success:false,error} when insert errors", async () => {
  const { client } = makeRecordingSupabase({
    data: null,
    error: { message: "duplicate key value violates unique constraint" },
  });
  const result = await createAuditLog(client, {
    event_type: AUDIT_EVENTS.MEMBERSHIP_CREATED,
    tenant_id: VALID_TENANT,
  });
  assertFalse(result.success);
  assert(result.error?.includes("duplicate"));
});

Deno.test("createAuditLog: writes to the audit_logs table", async () => {
  const { client, records } = makeRecordingSupabase();
  await createAuditLog(client, {
    event_type: AUDIT_EVENTS.MEMBERSHIP_PAID,
    tenant_id: VALID_TENANT,
  });
  assertEquals(records.length, 1);
  assertEquals(records[0].table, "audit_logs");
});

// =============================================================================
// Category auto-detection from event_type prefix
// =============================================================================

const categoryProbes: Array<[string, string]> = [
  [AUDIT_EVENTS.MEMBERSHIP_CREATED, "MEMBERSHIP"],
  [AUDIT_EVENTS.MEMBERSHIP_APPROVED, "MEMBERSHIP"],
  [AUDIT_EVENTS.TENANT_BILLING_UPDATED, "BILLING"],
  [AUDIT_EVENTS.BILLING_CONFIG_MISSING_BLOCKED, "BILLING"],
  [AUDIT_EVENTS.JOB_CLEANUP_ABANDONED_RUN, "JOB"],
  [AUDIT_EVENTS.DIPLOMA_ISSUED, "GRADING"],
  [AUDIT_EVENTS.GRADING_RECORDED, "GRADING"],
  [AUDIT_EVENTS.IMPERSONATION_STARTED, "SECURITY"],
  [AUDIT_EVENTS.LOGIN_SUCCESS, "AUTH"],
  [AUDIT_EVENTS.PASSWORD_RESET_REQUESTED, "AUTH"],
  [AUDIT_EVENTS.ROLES_GRANTED, "ROLES"],
  [AUDIT_EVENTS.TMP_DOCUMENT_CLEANED, "STORAGE"],
  [AUDIT_EVENTS.DIGITAL_CARD_GENERATED, "STORAGE"],
  [AUDIT_EVENTS.COUNCIL_DECISION_CREATED, "COUNCIL"],
  ["SOMETHING_RANDOM", "OTHER"],
];

for (const [eventType, expectedCategory] of categoryProbes) {
  Deno.test(`createAuditLog: auto-detects category ${expectedCategory} from ${eventType}`, async () => {
    const { client, records } = makeRecordingSupabase();
    // COUNCIL_DECISION_CREATED needs federation_id + council_id (PI-D5.A)
    const metadata = eventType === AUDIT_EVENTS.COUNCIL_DECISION_CREATED
      ? { federation_id: "fed-1", council_id: "council-1" }
      : undefined;
    await createAuditLog(client, {
      event_type: eventType,
      tenant_id: VALID_TENANT,
      metadata,
    });
    const payload = records[0].payload as { category: string };
    assertEquals(payload.category, expectedCategory);
  });
}

Deno.test("createAuditLog: provided metadata.category overrides auto-detection", async () => {
  const { client, records } = makeRecordingSupabase();
  await createAuditLog(client, {
    event_type: AUDIT_EVENTS.MEMBERSHIP_CREATED,
    tenant_id: VALID_TENANT,
    metadata: { category: "OTHER" },
  });
  // metadata.category wins; the column-level `category` also reflects auto-
  // detection though. Document the current behavior: the metadata wins for
  // metadata.category but the column gets auto-detect — this is the source
  // code's actual behavior at lines 284 and 321.
  const payload = records[0].payload as {
    category: string;
    metadata: { category: string };
  };
  assertEquals(payload.metadata.category, "OTHER");
});

// =============================================================================
// PI-D5.A federation/council mandatory fields
// =============================================================================

Deno.test("createAuditLog: rejects FEDERATION_CREATED without federation_id", async () => {
  const { client, records } = makeRecordingSupabase();
  const result = await createAuditLog(client, {
    event_type: AUDIT_EVENTS.FEDERATION_CREATED,
    tenant_id: VALID_TENANT,
  });
  assertFalse(result.success);
  assert(result.error?.includes("PI-D5.A"));
  assert(result.error?.includes("federation_id"));
  // Must NOT have hit the DB
  assertEquals(records.length, 0);
});

Deno.test("createAuditLog: accepts FEDERATION_CREATED with federation_id", async () => {
  const { client } = makeRecordingSupabase();
  const result = await createAuditLog(client, {
    event_type: AUDIT_EVENTS.FEDERATION_CREATED,
    tenant_id: VALID_TENANT,
    metadata: { federation_id: "fed-1" },
  });
  assertEquals(result.success, true);
});

Deno.test("createAuditLog: rejects TENANT_JOINED_FEDERATION without federation_id", async () => {
  const { client } = makeRecordingSupabase();
  const result = await createAuditLog(client, {
    event_type: AUDIT_EVENTS.TENANT_JOINED_FEDERATION,
    tenant_id: VALID_TENANT,
  });
  assertFalse(result.success);
  assert(result.error?.includes("federation_id"));
});

Deno.test("createAuditLog: rejects COUNCIL_CREATED without federation_id", async () => {
  const { client } = makeRecordingSupabase();
  const result = await createAuditLog(client, {
    event_type: AUDIT_EVENTS.COUNCIL_CREATED,
    tenant_id: VALID_TENANT,
    metadata: { council_id: "council-1" },
  });
  assertFalse(result.success);
  assert(result.error?.includes("federation_id"));
});

Deno.test("createAuditLog: rejects COUNCIL_CREATED without council_id", async () => {
  const { client } = makeRecordingSupabase();
  const result = await createAuditLog(client, {
    event_type: AUDIT_EVENTS.COUNCIL_CREATED,
    tenant_id: VALID_TENANT,
    metadata: { federation_id: "fed-1" },
  });
  assertFalse(result.success);
  assert(result.error?.includes("council_id"));
});

Deno.test("createAuditLog: accepts COUNCIL_CREATED with both federation_id and council_id", async () => {
  const { client } = makeRecordingSupabase();
  const result = await createAuditLog(client, {
    event_type: AUDIT_EVENTS.COUNCIL_CREATED,
    tenant_id: VALID_TENANT,
    metadata: { federation_id: "fed-1", council_id: "council-1" },
  });
  assertEquals(result.success, true);
});

// =============================================================================
// LGPD — PII sanitization
// =============================================================================

Deno.test("createAuditLog: masks email field in metadata before insert", async () => {
  const { client, records } = makeRecordingSupabase();
  await createAuditLog(client, {
    event_type: AUDIT_EVENTS.LOGIN_SUCCESS,
    tenant_id: VALID_TENANT,
    metadata: { email: "user@example.com" },
  });
  const meta = (records[0].payload as { metadata: Record<string, unknown> }).metadata;
  // Per maskEmail spec: "user@example.com" → "us***@example.com"
  assertEquals(meta.email, "us***@example.com");
});

Deno.test("createAuditLog: masks athlete_name field in metadata before insert", async () => {
  const { client, records } = makeRecordingSupabase();
  await createAuditLog(client, {
    event_type: AUDIT_EVENTS.MEMBERSHIP_PAID,
    tenant_id: VALID_TENANT,
    metadata: { athlete_name: "João Silva Santos" },
  });
  const meta = (records[0].payload as { metadata: Record<string, unknown> }).metadata;
  // Per maskName spec: "João Silva Santos" → "João S."
  assertEquals(meta.athlete_name, "João S.");
});

Deno.test("createAuditLog: non-PII fields pass through unchanged", async () => {
  const { client, records } = makeRecordingSupabase();
  await createAuditLog(client, {
    event_type: AUDIT_EVENTS.MEMBERSHIP_PAID,
    tenant_id: VALID_TENANT,
    metadata: {
      membership_id: "m-1",
      amount_cents: 15000,
      currency: "BRL",
      automatic: true,
    },
  });
  const meta = (records[0].payload as { metadata: Record<string, unknown> }).metadata;
  assertEquals(meta.membership_id, "m-1");
  assertEquals(meta.amount_cents, 15000);
  assertEquals(meta.currency, "BRL");
  assertEquals(meta.automatic, true);
});

// =============================================================================
// Default fields
// =============================================================================

Deno.test("createAuditLog: defaults occurred_at to a recent ISO timestamp when not provided", async () => {
  const before = Date.now();
  const { client, records } = makeRecordingSupabase();
  await createAuditLog(client, {
    event_type: AUDIT_EVENTS.MEMBERSHIP_CREATED,
    tenant_id: VALID_TENANT,
  });
  const after = Date.now();
  const meta = (records[0].payload as { metadata: { occurred_at: string } }).metadata;
  const ts = new Date(meta.occurred_at).getTime();
  assert(ts >= before - 10);
  assert(ts <= after + 10);
});

Deno.test("createAuditLog: preserves provided occurred_at", async () => {
  const { client, records } = makeRecordingSupabase();
  const explicit = "2025-01-15T10:30:00.000Z";
  await createAuditLog(client, {
    event_type: AUDIT_EVENTS.MEMBERSHIP_CREATED,
    tenant_id: VALID_TENANT,
    metadata: { occurred_at: explicit },
  });
  const meta = (records[0].payload as { metadata: { occurred_at: string } }).metadata;
  assertEquals(meta.occurred_at, explicit);
});

Deno.test("createAuditLog: defaults profile_id to null when not provided", async () => {
  const { client, records } = makeRecordingSupabase();
  await createAuditLog(client, {
    event_type: AUDIT_EVENTS.MEMBERSHIP_CREATED,
    tenant_id: VALID_TENANT,
  });
  const payload = records[0].payload as { profile_id: string | null };
  assertEquals(payload.profile_id, null);
});

Deno.test("createAuditLog: preserves provided profile_id", async () => {
  const { client, records } = makeRecordingSupabase();
  await createAuditLog(client, {
    event_type: AUDIT_EVENTS.MEMBERSHIP_CREATED,
    tenant_id: VALID_TENANT,
    profile_id: "profile-abc",
  });
  const payload = records[0].payload as { profile_id: string | null };
  assertEquals(payload.profile_id, "profile-abc");
});

Deno.test("createAuditLog: tenant_id may be null (platform-wide events)", async () => {
  const { client, records } = makeRecordingSupabase();
  await createAuditLog(client, {
    event_type: AUDIT_EVENTS.JOB_EXPIRE_TRIALS_RUN,
    tenant_id: null,
  });
  const payload = records[0].payload as { tenant_id: string | null };
  assertEquals(payload.tenant_id, null);
});

// =============================================================================
// createAuditLogBatch
// =============================================================================

Deno.test("createAuditLogBatch: returns aggregated counts when all succeed", async () => {
  const { client } = makeRecordingSupabase();
  const result = await createAuditLogBatch(client, [
    { event_type: AUDIT_EVENTS.MEMBERSHIP_CREATED, tenant_id: VALID_TENANT },
    { event_type: AUDIT_EVENTS.MEMBERSHIP_PAID, tenant_id: VALID_TENANT },
    { event_type: AUDIT_EVENTS.MEMBERSHIP_APPROVED, tenant_id: VALID_TENANT },
  ]);
  assertEquals(result.success, true);
  assertEquals(result.created, 3);
  assertEquals(result.failed, 0);
});

Deno.test("createAuditLogBatch: aggregates failures from PI-D5.A violations", async () => {
  const { client } = makeRecordingSupabase();
  const result = await createAuditLogBatch(client, [
    { event_type: AUDIT_EVENTS.MEMBERSHIP_CREATED, tenant_id: VALID_TENANT },
    { event_type: AUDIT_EVENTS.FEDERATION_CREATED, tenant_id: VALID_TENANT },
  ]);
  assertFalse(result.success); // because one failed
  assertEquals(result.created, 1);
  assertEquals(result.failed, 1);
});

Deno.test("createAuditLogBatch: handles empty entries array", async () => {
  const { client } = makeRecordingSupabase();
  const result = await createAuditLogBatch(client, []);
  assertEquals(result.success, true);
  assertEquals(result.created, 0);
  assertEquals(result.failed, 0);
});

Deno.test("createAuditLogBatch: aggregates DB-level failures", async () => {
  const { client } = makeRecordingSupabase({
    data: null,
    error: { message: "constraint violation" },
  });
  const result = await createAuditLogBatch(client, [
    { event_type: AUDIT_EVENTS.MEMBERSHIP_CREATED, tenant_id: VALID_TENANT },
    { event_type: AUDIT_EVENTS.MEMBERSHIP_PAID, tenant_id: VALID_TENANT },
  ]);
  assertFalse(result.success);
  assertEquals(result.created, 0);
  assertEquals(result.failed, 2);
});
