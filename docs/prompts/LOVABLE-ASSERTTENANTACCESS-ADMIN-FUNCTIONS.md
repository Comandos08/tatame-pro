# LOVABLE PROMPT — Apply `assertTenantAccess` to Admin Edge Functions

> **Type:** Security hardening — additive guard insertion
> **Priority:** P0 (close before PRD launch)
> **Scope:** `supabase/functions/_shared` is read-only here; only the listed
> handler files are modified.

---

## 1. OBJECTIVE

Adopt the existing `assertTenantAccess` guard (defined in
`supabase/functions/_shared/tenant-boundary.ts`) inside 8 admin/sensitive
Edge Functions that currently rely solely on RLS for tenant boundary
enforcement. Each function must FAIL CLOSED with HTTP 403 and the
A07 institutional error envelope when the caller has no membership in
the target tenant.

---

## 2. SYSTEM CONTEXT

- Multi-tenant SaaS — every write must respect tenant boundary.
- Today, only 12/66 functions call `assertTenantAccess`.
- The 8 listed below operate on tenant-scoped writes/reads but don't
  validate that the caller belongs to the tenant they target. RLS catches
  most cases but defense-in-depth + explicit error envelopes are required.

Existing utilities to reuse (do NOT modify):

- `supabase/functions/_shared/tenant-boundary.ts` —
  `assertTenantAccess(supabaseAdmin, userId, tenantId, impersonationId?, options?)`
  throws `TenantBoundaryError` with codes `TENANT_NOT_FOUND`, `TENANT_INACTIVE`,
  `NO_MEMBERSHIP`, `IMPERSONATION_REQUIRED`, `IMPERSONATION_MISMATCH`.
- `supabase/functions/_shared/errors/envelope.ts` — A07 error envelope helper.
- `supabase/functions/_shared/cors.ts` — `corsPreflightResponse`, `buildCorsHeaders`.

---

## 3. CURRENT STATE

The 8 target functions authenticate the caller and check role, but DO NOT
verify that the resolved `tenantId` (from request body, membership lookup,
or path) matches a tenant the caller has membership in.

| # | Function | How tenantId is resolved today |
|---|---|---|
| 1 | `admin-create-user` | `tenantId` from request body |
| 2 | `admin-reset-password` | derived from target user's profile |
| 3 | `admin-billing-control` | `tenantId` from request body |
| 4 | `approve-membership` | `tenantId` from membership row |
| 5 | `reject-membership` | `tenantId` from membership row |
| 6 | `get-document` | `tenantId` from document row |
| 7 | `import-athletes` | `tenantId` from request body |
| 8 | `export-athlete-data` | `tenantId` from athlete row |

---

## 4. EXPECTED BEHAVIOR

For each function above, after the existing auth + role check and BEFORE any
write/read of tenant-scoped data:

1. Resolve `tenantId` exactly as today.
2. Read `x-impersonation-id` from request headers (may be null).
3. Call:

   ```ts
   await assertTenantAccess(
     supabaseAdmin,
     caller.id,
     tenantId,
     req.headers.get("x-impersonation-id"),
   );
   ```

4. Wrap in `try { ... } catch (e) { if (e instanceof TenantBoundaryError) return 403 envelope }`.
5. Existing happy path proceeds unchanged.

For `admin-create-user`:
- If `tenantId` is omitted in the body (creating a tenant-less user), skip the
  check. If present, enforce it.

For `admin-reset-password`:
- Resolve target user's `tenant_id` from `profiles`. If null (cross-tenant
  user, e.g., SUPERADMIN-only), skip. Otherwise enforce.

For SUPERADMIN callers:
- `assertTenantAccess` already enforces impersonation match. Do not bypass it
  for SUPERADMIN unless the function is explicitly cross-tenant by design
  (none of the 8 are — all target a specific tenant).

---

## 5. FILES LIKELY AFFECTED

```
supabase/functions/admin-create-user/index.ts
supabase/functions/admin-reset-password/index.ts
supabase/functions/admin-billing-control/index.ts
supabase/functions/approve-membership/index.ts
supabase/functions/reject-membership/index.ts
supabase/functions/get-document/index.ts
supabase/functions/import-athletes/index.ts
supabase/functions/export-athlete-data/index.ts
```

NEW unit tests (one per function):

```
supabase/functions/_tests/admin-create-user-tenant-boundary.test.ts
supabase/functions/_tests/admin-reset-password-tenant-boundary.test.ts
supabase/functions/_tests/admin-billing-control-tenant-boundary.test.ts
supabase/functions/_tests/approve-membership-tenant-boundary.test.ts
supabase/functions/_tests/reject-membership-tenant-boundary.test.ts
supabase/functions/_tests/get-document-tenant-boundary.test.ts
supabase/functions/_tests/import-athletes-tenant-boundary.test.ts
supabase/functions/_tests/export-athlete-data-tenant-boundary.test.ts
```

NO changes to:
- `_shared/tenant-boundary.ts` (utility is stable)
- Other 58 edge functions
- Migrations
- Frontend code
- Routes

---

## 6. CONSTRAINTS

- Additive only. Do NOT change existing happy-path behavior.
- Do NOT alter request/response shapes of any function.
- Preserve the existing auth/role check sequence — the new guard runs
  immediately AFTER role validation and BEFORE any tenant-scoped write.
- Preserve the existing rate-limiter call ordering.
- Reuse the existing error-response helper (`buildErrorEnvelope` from
  `_shared/errors/envelope.ts`) so the 403 emitted on `TenantBoundaryError`
  matches A07.
- All new error responses MUST include `correlationId` from
  `extractCorrelationId(req)`.
- The `TENANT_NOT_FOUND` and `TENANT_INACTIVE` codes map to HTTP 404 and 410
  respectively; `NO_MEMBERSHIP`, `IMPERSONATION_REQUIRED`, and
  `IMPERSONATION_MISMATCH` map to 403.

---

## 7. ACCEPTANCE CRITERIA

For each of the 8 functions, the new behavior is:

1. Caller authenticated + role-checked + rate-limit passed →
   `assertTenantAccess` is invoked.
2. Caller is NOT a member of the target tenant → response is HTTP 403,
   body matches `{ error: string, code: "NO_MEMBERSHIP", correlationId }`,
   and an audit log row of type `TENANT_BOUNDARY_VIOLATION` is created.
3. SUPERADMIN caller without valid impersonation for the target tenant →
   response is HTTP 403 with `code: "IMPERSONATION_REQUIRED"`.
4. SUPERADMIN with valid impersonation → flow proceeds as today.
5. Tenant inactive → HTTP 410 with `code: "TENANT_INACTIVE"`.
6. Existing happy path → unchanged response shape and audit events.
7. Vitest passes for all 8 new tenant-boundary unit tests.
8. Existing E2E suite passes (no regressions in `e2e/security/*.spec.ts`).

---

## 8. TESTING REQUIREMENTS

For EACH of the 8 functions, create a Vitest spec that mocks
`supabaseAdmin` and verifies:

- Happy path (caller is member → 200/expected response).
- `NO_MEMBERSHIP` → 403 envelope.
- `TENANT_INACTIVE` → 410 envelope.
- SUPERADMIN without impersonation → 403 with `IMPERSONATION_REQUIRED`.
- SUPERADMIN with valid impersonation → 200/expected.
- Audit log `TENANT_BOUNDARY_VIOLATION` written on each rejection.

Pattern existing tests in `supabase/functions/_tests/` for setup/teardown.

Then run:
```bash
npm run lint
npx tsc --noEmit
npx vitest run
npx playwright test e2e/security
```

All must pass green.

---

## 9. RISK ANALYSIS

| Risk | Mitigation |
|---|---|
| Breaking happy path for legitimate SUPERADMIN without impersonation header | Audit existing flows: every superadmin operation already establishes impersonation via `start-impersonation`; functions whose business rule is "global cross-tenant" must NOT receive the new guard. None of the 8 listed are global. |
| Doubled work with RLS rejecting later anyway | Acceptable — the explicit guard yields a clean 403 with `correlationId`, vs an opaque 500 from a downstream RLS denial. |
| Cron jobs reaching admin functions | Cron functions do not call admin-* — this is a one-direction concern. |

---

## 10. OUT OF SCOPE

- The other 53 functions: cron jobs, public verifiers, healthcheck, stripe-webhook,
  password-reset flows. These either don't have a tenant context or already
  use service_role + signature verification.
- MFA — separate prompt.
- Mobile responsive UI — separate prompt.

---

## 11. ROLLBACK

If anything breaks: revert the commit. The guard is purely additive — the
revert restores prior behavior with no data migration needed.
