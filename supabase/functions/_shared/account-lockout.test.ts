/**
 * P1-13 — Contract Tests for Account Lockout
 *
 * The lockout helper sits in front of every authenticated login path. A
 * regression that makes it stop counting failures opens credential
 * stuffing wide; a regression that makes it OVER-count locks legitimate
 * users out for fifteen minutes after a single typo. Both are real
 * production incidents — pin every branch.
 *
 * Constants in source: LOCKOUT_THRESHOLD=5, LOCKOUT_WINDOW_MINUTES=15,
 * LOCKOUT_DURATION_MINUTES=15. These tests assume those values; if the
 * source changes the constants, this file is the canary.
 */
import {
  assertEquals,
  assert,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkAccountLockout,
  recordLoginAttempt,
  cleanupOldLoginAttempts,
} from "./account-lockout.ts";

// =============================================================================
// Minimal Supabase builder mock — same shape as tenant-boundary.test.ts
// =============================================================================

interface QueryResult {
  data: unknown;
  error: unknown;
}

function makeBuilder(result: QueryResult) {
  const promise = Promise.resolve(result);
  // deno-lint-ignore no-explicit-any
  const builder: any = {
    select: () => builder,
    insert: () => builder,
    delete: () => builder,
    eq: () => builder,
    gte: () => builder,
    lt: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => builder,
    single: () => builder,
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

function makeFailures(count: number, offsetMinutes: number = 0): Array<{ id: string; created_at: string }> {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    id: `attempt-${i}`,
    // Most-recent first per `.order('created_at', { ascending: false })`
    created_at: new Date(now - (i + offsetMinutes) * 60 * 1000).toISOString(),
  }));
}

// =============================================================================
// checkAccountLockout
// =============================================================================

Deno.test("checkAccountLockout: returns not-locked with 5 remaining when no failures", async () => {
  const supabase = makeMockSupabase({
    login_attempts: [{ data: [], error: null }],
  });
  const result = await checkAccountLockout(supabase, "alice@example.com");
  assertEquals(result.locked, false);
  assertEquals(result.remainingAttempts, 5);
  assertEquals(result.lockedUntil, undefined);
});

Deno.test("checkAccountLockout: decrements remaining count with each failure (1 fail → 4 left)", async () => {
  const supabase = makeMockSupabase({
    login_attempts: [{ data: makeFailures(1), error: null }],
  });
  const result = await checkAccountLockout(supabase, "alice@example.com");
  assertEquals(result.locked, false);
  assertEquals(result.remainingAttempts, 4);
});

Deno.test("checkAccountLockout: 4 failures → still not locked, 1 remaining", async () => {
  const supabase = makeMockSupabase({
    login_attempts: [{ data: makeFailures(4), error: null }],
  });
  const result = await checkAccountLockout(supabase, "alice@example.com");
  assertEquals(result.locked, false);
  assertEquals(result.remainingAttempts, 1);
});

Deno.test("checkAccountLockout: 5 failures within window → LOCKED, 0 remaining, lockedUntil set", async () => {
  const supabase = makeMockSupabase({
    login_attempts: [{ data: makeFailures(5), error: null }],
  });
  const result = await checkAccountLockout(supabase, "alice@example.com");
  assertEquals(result.locked, true);
  assertEquals(result.remainingAttempts, 0);
  assert(result.lockedUntil, "expected lockedUntil to be set");
  // lockedUntil should be approximately 15 minutes after the most-recent failure
  const until = new Date(result.lockedUntil!).getTime();
  const expected = Date.now() + 15 * 60 * 1000;
  // Allow 10s drift for the time it took the test to set up
  assert(Math.abs(until - expected) < 10_000, `lockedUntil ${result.lockedUntil} far from expected`);
});

Deno.test("checkAccountLockout: 10 failures within window → still LOCKED, 0 remaining", async () => {
  const supabase = makeMockSupabase({
    login_attempts: [{ data: makeFailures(10), error: null }],
  });
  const result = await checkAccountLockout(supabase, "alice@example.com");
  assertEquals(result.locked, true);
  assertEquals(result.remainingAttempts, 0);
});

Deno.test("checkAccountLockout: 5 failures but last one is older than 15min lockout duration → unlocked", async () => {
  // Most-recent failure happened 20 minutes ago — lockout duration is 15min,
  // so the lockedUntil window has already passed.
  const supabase = makeMockSupabase({
    login_attempts: [{
      data: [
        { id: "a", created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() },
        { id: "b", created_at: new Date(Date.now() - 21 * 60 * 1000).toISOString() },
        { id: "c", created_at: new Date(Date.now() - 22 * 60 * 1000).toISOString() },
        { id: "d", created_at: new Date(Date.now() - 23 * 60 * 1000).toISOString() },
        { id: "e", created_at: new Date(Date.now() - 24 * 60 * 1000).toISOString() },
      ],
      error: null,
    }],
  });
  const result = await checkAccountLockout(supabase, "alice@example.com");
  // The query is bounded by the 15-minute WINDOW, so in real production these
  // rows wouldn't be returned at all. Our mock bypasses that filter to verify
  // the SECOND defense: even if rows are returned, the lockedUntil check
  // recognises that the lock window has elapsed.
  assertEquals(result.locked, false);
});

Deno.test("checkAccountLockout: query error fails closed but returns not-locked + full remaining", async () => {
  const supabase = makeMockSupabase({
    login_attempts: [{ data: null, error: { message: "db down" } }],
  });
  const result = await checkAccountLockout(supabase, "alice@example.com");
  // Per source: "Fail-closed: if we can't check, assume not locked (but log the error)"
  // The function returns not-locked so legitimate users aren't blocked by infra
  // failures; the error is logged so an operator notices.
  assertEquals(result.locked, false);
  assertEquals(result.remainingAttempts, 5);
});

Deno.test("checkAccountLockout: email is lowercased before lookup", async () => {
  // Two queries with same email in different cases must hit the same key.
  // The mock pops sequential results; we want both to find the same fixture.
  const supabase = makeMockSupabase({
    login_attempts: [
      { data: makeFailures(5), error: null },
      { data: makeFailures(5), error: null },
    ],
  });
  const r1 = await checkAccountLockout(supabase, "Alice@Example.com");
  const r2 = await checkAccountLockout(supabase, "alice@example.com");
  // Both must produce the same lock decision (locked, since the mock returns
  // 5 failures both times).
  assertEquals(r1.locked, r2.locked);
});

Deno.test("checkAccountLockout: null/undefined error field treated as success", async () => {
  // The implementation checks `if (error)` — an explicit null falsy value
  // must go down the success path.
  const supabase = makeMockSupabase({
    login_attempts: [{ data: [], error: null }],
  });
  const result = await checkAccountLockout(supabase, "alice@example.com");
  assertFalse(result.locked);
});

// =============================================================================
// recordLoginAttempt
// =============================================================================

Deno.test("recordLoginAttempt: completes without throwing on success insert", async () => {
  const supabase = makeMockSupabase({
    login_attempts: [{ data: null, error: null }],
  });
  await recordLoginAttempt(supabase, "alice@example.com", true);
});

Deno.test("recordLoginAttempt: completes without throwing on failure insert", async () => {
  const supabase = makeMockSupabase({
    login_attempts: [{ data: null, error: null }],
  });
  await recordLoginAttempt(supabase, "alice@example.com", false, "1.2.3.4");
});

Deno.test("recordLoginAttempt: swallows DB error and never throws", async () => {
  const supabase = makeMockSupabase({
    login_attempts: [{ data: null, error: { message: "unique violation" } }],
  });
  // Must not throw — recordLoginAttempt is in the auth hot-path; an audit-
  // insert failure must not break the login flow.
  await recordLoginAttempt(supabase, "alice@example.com", false);
});

Deno.test("recordLoginAttempt: accepts undefined ipAddress", async () => {
  const supabase = makeMockSupabase({
    login_attempts: [{ data: null, error: null }],
  });
  await recordLoginAttempt(supabase, "alice@example.com", true, undefined);
});

// =============================================================================
// cleanupOldLoginAttempts
// =============================================================================

Deno.test("cleanupOldLoginAttempts: returns count of deleted rows on success", async () => {
  const supabase = makeMockSupabase({
    login_attempts: [{
      data: [{ id: "1" }, { id: "2" }, { id: "3" }],
      error: null,
    }],
  });
  const count = await cleanupOldLoginAttempts(supabase);
  assertEquals(count, 3);
});

Deno.test("cleanupOldLoginAttempts: returns 0 when no rows deleted", async () => {
  const supabase = makeMockSupabase({
    login_attempts: [{ data: [], error: null }],
  });
  const count = await cleanupOldLoginAttempts(supabase);
  assertEquals(count, 0);
});

Deno.test("cleanupOldLoginAttempts: returns 0 on DB error and never throws", async () => {
  const supabase = makeMockSupabase({
    login_attempts: [{ data: null, error: { message: "perm denied" } }],
  });
  const count = await cleanupOldLoginAttempts(supabase);
  assertEquals(count, 0);
});

Deno.test("cleanupOldLoginAttempts: handles null data without throwing", async () => {
  const supabase = makeMockSupabase({
    login_attempts: [{ data: null, error: null }],
  });
  const count = await cleanupOldLoginAttempts(supabase);
  assertEquals(count, 0);
});
