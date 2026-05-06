import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * RLS Isolation Suite — Cross-Tenant Leakage Detection
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates that Row Level Security policies prevent any tenant from reading,
 * inserting, updating, or deleting data scoped to another tenant.
 *
 * STATUS: Skeleton — fixtures + assertions wired, but the test users and
 * tenants must be seeded in the target Supabase project before this suite
 * can run green. See `e2e/fixtures/README.md` for the seed contract.
 *
 * REQUIREMENTS to enable:
 *   1. Seed two distinct tenants (TENANT_A, TENANT_B) in the staging project
 *   2. Seed an ADMIN_TENANT user inside each
 *   3. Provide credentials via env: E2E_RLS_*_EMAIL / E2E_RLS_*_PASSWORD
 *   4. Run with `npx playwright test e2e/security/rls-isolation.spec.ts`
 *
 * The suite is intentionally read-and-write to detect both information
 * disclosure (SELECT leakage) and integrity violations (INSERT/UPDATE
 * cross-tenant). Each block runs against the live staging DB; failures
 * mean an RLS policy regressed.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  "";

const TENANT_A_EMAIL = process.env.E2E_RLS_TENANT_A_EMAIL ?? "";
const TENANT_A_PASS = process.env.E2E_RLS_TENANT_A_PASSWORD ?? "";
const TENANT_A_ID = process.env.E2E_RLS_TENANT_A_ID ?? "";

const TENANT_B_EMAIL = process.env.E2E_RLS_TENANT_B_EMAIL ?? "";
const TENANT_B_PASS = process.env.E2E_RLS_TENANT_B_PASSWORD ?? "";
const TENANT_B_ID = process.env.E2E_RLS_TENANT_B_ID ?? "";

const SHOULD_RUN =
  SUPABASE_URL &&
  SUPABASE_ANON &&
  TENANT_A_EMAIL &&
  TENANT_A_PASS &&
  TENANT_A_ID &&
  TENANT_B_EMAIL &&
  TENANT_B_PASS &&
  TENANT_B_ID;

test.describe("RLS isolation — cross-tenant leakage detection", () => {
  test.skip(!SHOULD_RUN, "RLS suite requires seeded test tenants in staging.");

  async function clientFor(email: string, password: string) {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    expect(error, `signIn failed for ${email}`).toBeNull();
    expect(data.session, `no session for ${email}`).not.toBeNull();
    return sb;
  }

  // Tables that must be tenant-isolated. Add new tenant-scoped tables here
  // as the schema grows so isolation is validated by default.
  const ISOLATED_TABLES = [
    "athletes",
    "memberships",
    "documents",
    "guardians",
    "guardian_links",
    "academies",
    "events",
    "audit_logs",
  ] as const;

  for (const table of ISOLATED_TABLES) {
    test(`SELECT ${table}: tenant A cannot read tenant B rows`, async () => {
      const sb = await clientFor(TENANT_A_EMAIL, TENANT_A_PASS);
      const { data, error } = await sb
        .from(table)
        .select("id, tenant_id")
        .eq("tenant_id", TENANT_B_ID);

      // Either the policy filters everything out (data === [])
      // or returns an explicit error. Both are acceptable;
      // returning ANY row from the other tenant is a leak.
      if (error) {
        // Permission denied is fine.
        expect(error.code === "42501" || error.message.includes("permission")).toBeTruthy();
      } else {
        expect(data, `${table} leaked rows of tenant B to tenant A`).toEqual([]);
      }
    });
  }

  test("INSERT athletes: tenant A cannot insert into tenant B", async () => {
    const sb = await clientFor(TENANT_A_EMAIL, TENANT_A_PASS);
    const { error } = await sb.from("athletes").insert({
      tenant_id: TENANT_B_ID,
      full_name: "RLS leak attempt",
      birth_date: "2000-01-01",
    });
    // Must reject. Either RLS denies (42501) or FK/constraint kicks in.
    expect(error, "INSERT into other tenant must be rejected").not.toBeNull();
  });

  test("UPDATE memberships: tenant A cannot mutate tenant B records", async () => {
    const sb = await clientFor(TENANT_A_EMAIL, TENANT_A_PASS);
    const { data, error } = await sb
      .from("memberships")
      .update({ status: "ACTIVE" })
      .eq("tenant_id", TENANT_B_ID)
      .select();

    if (error) {
      expect(error.code === "42501" || error.message.includes("permission")).toBeTruthy();
    } else {
      expect(data ?? [], "UPDATE leaked into tenant B").toEqual([]);
    }
  });

  test("digital_cards: anon enumeration is blocked", async () => {
    // Anonymous client (no signIn) must not be able to list all cards.
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
    const { data, error } = await sb.from("digital_cards").select("id").limit(100);
    if (!error) {
      // After 20260316000001_security_audit_fixes the policy requires
      // a join to an active/approved+paid membership. A blanket SELECT
      // from anon must return zero rows.
      expect(data ?? [], "digital_cards leaked to anon").toEqual([]);
    }
  });
});
