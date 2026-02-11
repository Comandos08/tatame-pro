

# A04 — Zero-Trust Tenant Boundary Enforcement

## Overview

Formalize tenant isolation with a fail-closed backend guard (`tenant-boundary.ts`) and a frontend hard-validation layer in TenantContext/TenantLayout. Both mandatory adjustments from review are applied.

## What Does NOT Change

- No database migrations, no RLS changes, no route changes
- No Stripe/webhook contract changes, no frontend behavior for valid users
- No `console.*` (institutional logger only)

---

## Phase 1 -- Backend: `tenant-boundary.ts` (New File)

**File:** `supabase/functions/_shared/tenant-boundary.ts`

### Adjustment 1 Applied: `assertTenantAccess` THROWS (fail-closed)

Instead of returning `{ allowed: false }`, the function throws a structured `TenantBoundaryError`. Callers cannot ignore it.

```text
class TenantBoundaryError extends Error {
  code: 'TENANT_NOT_FOUND' | 'TENANT_INACTIVE' | 'NO_MEMBERSHIP' | 'IMPERSONATION_REQUIRED' | 'IMPERSONATION_MISMATCH'
}
```

**`assertTenantAccess(supabaseAdmin, userId, tenantId)`**
- Validates tenantId is UUID format
- Checks tenant exists and `is_active = true`
- Checks user has membership in `user_roles` for this tenant OR is SUPERADMIN with valid impersonation
- If ANY check fails: throws `TenantBoundaryError`
- If all pass: returns `{ userId, tenantId, isSuperadmin }` (success metadata)

**`assertTenantMatchesImpersonation(supabaseAdmin, userId, tenantId, impersonationId)`**
- Delegates to existing `requireImpersonationIfSuperadmin`
- If invalid: throws `TenantBoundaryError` with appropriate code

**`isUuidFormat(value)`** -- simple UUID regex guard

**`assertBillingTenantConsistency(supabaseAdmin, tenantId)`**
- Post-write detection: if `is_active=true` but billing NOT in (ACTIVE, TRIALING), or vice-versa
- Uses `deriveTenantActive` from billing-state-machine.ts
- Throws on mismatch (callers catch, audit, never 500)

### Handler-side usage pattern:

```text
try {
  await assertTenantAccess(supabaseAdmin, userId, tenantId);
} catch (err) {
  if (err instanceof TenantBoundaryError) {
    log.error("Tenant boundary violation", err, { code: err.code });
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.TENANT_BOUNDARY_VIOLATION,
      tenant_id: tenantId,
      metadata: { ... }
    });
    return forbiddenResponse("...", corsHeaders, correlationId);
  }
  throw err; // unexpected error, let outer handler catch
}
```

---

## Phase 2 -- Audit Event

**File:** `supabase/functions/_shared/audit-logger.ts`

Add to `AUDIT_EVENTS`:

```typescript
TENANT_BOUNDARY_VIOLATION: 'TENANT_BOUNDARY_VIOLATION',
```

Update `detectCategory` to map `TENANT_BOUNDARY_*` prefix to `'SECURITY'`.

---

## Phase 3 -- Frontend: TenantContext Boundary Signal

**File:** `src/contexts/TenantContext.tsx`

After tenant is resolved from slug, add cross-check:

1. Import `useCurrentUser` from AuthContext
2. After `setTenant(tenantData)`, if user is authenticated AND NOT superadmin:
   - Check if `tenant.id` exists in `currentRolesByTenant` map
   - If NOT present: set `boundaryViolation: true` in state
3. Expose `boundaryViolation: boolean` in context
4. If user is SUPERADMIN or not yet authenticated (profile still loading): `boundaryViolation = false` (IdentityGate handles SUPERADMIN, RLS handles the rest)

---

## Phase 4 -- Frontend: TenantLayout Block

**File:** `src/layouts/TenantLayout.tsx`

In `TenantContent`, after error/loading checks (Step 3), before billing check (Step 4):

```text
if (boundaryViolation) {
  return (
    <BlockedStateCard
      icon={ShieldAlert}
      iconVariant="destructive"
      titleKey="tenant.boundaryViolation"
      descriptionKey="tenant.boundaryViolationDesc"
      actions={[{ labelKey: 'common.goHome', onClick: () => navigate('/'), icon: Home }]}
    />
  );
}
```

---

## Phase 5 -- i18n Keys

Add to all 3 locale files (`pt-BR.ts`, `en.ts`, `es.ts`):

```text
'tenant.boundaryViolation': 'Acesso negado' / 'Access denied' / 'Acceso denegado'
'tenant.boundaryViolationDesc': 'Voce nao tem permissao...' / 'You do not have...' / 'No tiene permiso...'
```

---

## Phase 6 -- CI Gate G6 (Adjustment 2 Applied: Hardened)

**File:** `.github/workflows/supabase-check.yml`

```yaml
- name: G6 — Tenant boundary guard exists and exports required functions
  run: |
    BOUNDARY="supabase/functions/_shared/tenant-boundary.ts"
    FAILED=0

    if [ ! -f "$BOUNDARY" ]; then
      echo "FAIL: tenant-boundary.ts not found"
      FAILED=1
    fi

    if ! grep -q "assertTenantAccess" "$BOUNDARY"; then
      echo "FAIL: assertTenantAccess not exported"
      FAILED=1
    fi

    if ! grep -q "assertTenantMatchesImpersonation" "$BOUNDARY"; then
      echo "FAIL: assertTenantMatchesImpersonation not exported"
      FAILED=1
    fi

    if ! grep -q "TenantBoundaryError" "$BOUNDARY"; then
      echo "FAIL: TenantBoundaryError class not defined"
      FAILED=1
    fi

    # Verify adoption in key functions
    for fn in start-impersonation validate-impersonation stripe-webhook; do
      FN_FILE="supabase/functions/$fn/index.ts"
      if [ -f "$FN_FILE" ] && ! grep -q "tenant-boundary\|assertTenantAccess" "$FN_FILE"; then
        echo "WARN: $fn does not use tenant-boundary (incremental adoption)"
      fi
    done

    if [ "$FAILED" -eq 1 ]; then exit 1; fi
    echo "G6 passed"
```

G6 enforces the guard file exists with correct exports and warns (but does not fail) on missing adoption in key functions during this phase. This avoids breaking CI while providing visibility.

---

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/_shared/tenant-boundary.ts` | NEW -- TenantBoundaryError, assertTenantAccess (throws), assertTenantMatchesImpersonation, assertBillingTenantConsistency |
| `supabase/functions/_shared/audit-logger.ts` | Add TENANT_BOUNDARY_VIOLATION event + category mapping |
| `src/contexts/TenantContext.tsx` | Add boundaryViolation cross-check |
| `src/layouts/TenantLayout.tsx` | Add boundary violation block UI |
| `src/locales/pt-BR.ts` | Add 2 i18n keys |
| `src/locales/en.ts` | Add 2 i18n keys |
| `src/locales/es.ts` | Add 2 i18n keys |
| `.github/workflows/supabase-check.yml` | Add G6 gate |

## Adjustment Summary

| # | Issue | Resolution |
|---|---|---|
| 1 | assertTenantAccess must throw, not return boolean | Uses `TenantBoundaryError` class with structured `code` -- impossible to ignore |
| 2 | G6 must verify adoption, not just file existence | Checks exports + warns on missing adoption in key functions |

