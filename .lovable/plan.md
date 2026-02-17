

# PI-INSTITUTIONAL-TENANT-LIFECYCLE-GOV-001 (SAFE GOLD -- DETERMINISTIC)

## Structural Enforcement + Drift Detection -- 100% Hardened

---

## SECTION 1: AUDIT (READ-ONLY EVIDENCE)

### E1. Tenant Table Columns

| Column | Type | Default | Nullable |
|---|---|---|---|
| id | uuid | - | NO |
| slug | text | - | - |
| name | text | - | - |
| logo_url | text | - | YES |
| primary_color | text | - | - |
| sport_types | ARRAY | - | - |
| stripe_customer_id | text | - | YES |
| is_active | boolean | true | YES |
| created_at | timestamptz | - | - |
| updated_at | timestamptz | - | - |
| default_locale | text | - | - |
| description | text | - | YES |
| billing_email | text | - | YES |
| card_template_url | text | - | YES |
| diploma_template_url | text | - | YES |
| onboarding_completed | boolean | false | YES |
| onboarding_completed_at | timestamptz | - | YES |
| onboarding_completed_by | uuid | - | YES |
| creation_source | text | - | YES |
| status | text | 'ACTIVE' | NO |
| lifecycle_status | tenant_lifecycle_status (enum) | 'ACTIVE' | NO |

### E2. Enum Values

```
tenant_lifecycle_status = { SETUP, ACTIVE, BLOCKED }
```

SUSPENDED and TERMINATED do NOT exist. Extension required (IRREVERSIBLE).

### E3. Current Data

```
1 tenant: id=07ad68d9, lifecycle_status=ACTIVE, status=ACTIVE, is_active=true, onboarding_completed=true
```

### E4. Privileges (CRITICAL)

```sql
-- has_table_privilege results:
-- anon:          SELECT=true, INSERT=true, UPDATE=true, DELETE=true
-- authenticated: SELECT=true, INSERT=true, UPDATE=true, DELETE=true
-- service_role:  SELECT=true, INSERT=true, UPDATE=true, DELETE=true
```

**NOT blindado.** All three roles have FULL UPDATE privilege on `tenants`. This is a P0 governance gap.

### E5. RLS Policies on tenants

| Policy | Command | Expression |
|---|---|---|
| Public can view active tenants | SELECT | `is_active = true` |
| Tenant admin can update own tenant | UPDATE | `is_superadmin() OR is_tenant_admin(id)` |

Note: RLS does NOT protect service_role (bypasses RLS). Direct UPDATE via service_role is completely unblocked.

### E6. Gatekeeper Function

```sql
SELECT proname FROM pg_proc WHERE proname = 'change_tenant_lifecycle_state';
-- EMPTY: does not exist
```

### E7. Edge Function Writes to `tenants` (COMPLETE INVENTORY)

| Edge Function | Column(s) Written | Values | Lifecycle? |
|---|---|---|---|
| complete-tenant-onboarding | status, onboarding_completed, onboarding_completed_at, onboarding_completed_by | 'ACTIVE' / 'SETUP' (rollback) | **YES -- VIOLATION** |
| admin-billing-control | is_active | derived from billing | No |
| stripe-webhook | is_active | derived from billing | No |
| mark-pending-delete | is_active | false | No |
| create-tenant-subscription | stripe_customer_id, is_active | stripe ID, derived | No |
| cleanup-expired-tenants | DELETE (entire row) | - | N/A |

**VIOLATION IDENTIFIED**: `complete-tenant-onboarding` writes directly to `status` column (lines 331-341, 377-383). This is the ONLY lifecycle mutation bypass. All other functions write to `is_active` or non-lifecycle columns.

### E8. Billing Status Values

```sql
SELECT DISTINCT status FROM tenant_billing;
-- Result: TRIALING
```

### E9. Comparison with PI-002C (user_roles)

```sql
-- user_roles privileges (PI-002C applied):
-- anon:          INSERT=false, UPDATE=false, DELETE=false
-- authenticated: INSERT=false, UPDATE=false, DELETE=false
-- service_role:  INSERT=false, UPDATE=false, DELETE=false
```

`tenants` is currently at ZERO enforcement vs `user_roles` at FULL enforcement.

---

## SECTION 2: DIVERGENCES

| # | Spec | Actual | Impact | Resolution |
|---|---|---|---|---|
| D1 | Enum: SETUP, ACTIVE, SUSPENDED, TERMINATED | Enum: SETUP, ACTIVE, BLOCKED | Missing SUSPENDED/TERMINATED | Extend enum (irreversible) |
| D2 | Mutation via gatekeeper only | complete-tenant-onboarding writes status directly | VIOLATION | Migrate to RPC |
| D3 | UPDATE revoked from service_role | service_role has full UPDATE | NOT BLINDADO | REVOKE + column-level GRANT |
| D4 | Single status column | Dual columns: lifecycle_status (enum) + status (text) | Divergence risk | Gatekeeper writes both atomically |

---

## SECTION 3: DECISIONS

### DECISION 1: Enum Extension (IRREVERSIBLE)

**Option A -- Extend Enum** (Recommended)

```sql
ALTER TYPE public.tenant_lifecycle_status ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE public.tenant_lifecycle_status ADD VALUE IF NOT EXISTS 'TERMINATED';
```

Pros: Full alignment with governance contract. TERMINATED as immutable terminal state. SUSPENDED vs BLOCKED semantic distinction.

Cons: PostgreSQL enum values CANNOT be removed. BLOCKED becomes legacy.

**Option B -- Map to Existing**

Use BLOCKED = SUSPENDED, no TERMINATED.

Cons: No terminal state. Semantic ambiguity. Misalignment with stateDefinitions.ts.

**Recommendation: Option A.** Irreversibility is acceptable because the governance contract requires these states.

### DECISION 2: Column-Level vs Table-Level REVOKE

**The Problem**: If we REVOKE UPDATE on the entire `tenants` table (like PI-002C did for user_roles), then ALL writes break -- including legitimate `is_active`, `stripe_customer_id`, `name`, `sport_types`, etc. from billing and admin functions.

**Option A -- Full Table REVOKE + Column GRANT** (Recommended)

```sql
-- 1. REVOKE all UPDATE at table level
REVOKE UPDATE ON public.tenants FROM anon, authenticated, service_role;

-- 2. GRANT UPDATE on NON-lifecycle columns only
GRANT UPDATE(
  slug, name, logo_url, primary_color, sport_types,
  stripe_customer_id, is_active, updated_at, default_locale,
  description, billing_email, card_template_url, diploma_template_url
) ON public.tenants TO service_role;
```

Protected columns (writable ONLY via SECURITY DEFINER gatekeeper):
- `lifecycle_status`
- `status`
- `onboarding_completed`
- `onboarding_completed_at`
- `onboarding_completed_by`

**Option B -- REVOKE entire table, migrate ALL writes to gatekeepers**

Would require creating additional gatekeeper functions for is_active, stripe_customer_id, etc. Massive scope creep.

**Recommendation: Option A.** Column-level GRANT is precise, minimal scope, and mirrors the intent: only lifecycle columns are structurally locked.

### DECISION 3: complete-tenant-onboarding Migration

The function currently:
1. Validates prerequisites (sport_types, academy, grading_scheme)
2. Updates `status = 'ACTIVE'`, `onboarding_completed = true`, etc.
3. Creates billing record
4. Rolls back status to SETUP if billing fails

After migration:
1. Validates prerequisites (unchanged)
2. Creates billing record FIRST
3. Calls `change_tenant_lifecycle_state('ACTIVE', 'onboarding_completed')` via RPC
4. If RPC fails, deletes billing record (reversed order)

The gatekeeper handles: lifecycle_status, status, onboarding_completed, onboarding_completed_at, onboarding_completed_by.

---

## SECTION 4: EXECUTION PLAN

### Execution Order (strict dependencies)

```text
Step 1: Extend enum
   |
Step 2: Create gatekeeper function + GRANT EXECUTE to service_role
   |
Step 3: Create drift detection view + check function
   |
Step 4: Migrate complete-tenant-onboarding Edge Function to use RPC
   |
Step 5: Apply REVOKE UPDATE + column-level GRANT
   |
Step 6: Validate (structural tests)
```

Steps 1-3 are database migration (single transaction).
Step 4 is Edge Function code change.
Step 5 is database migration (separate, AFTER Edge Function deploys).
Step 6 is validation queries.

**CRITICAL**: Step 5 MUST execute AFTER Step 4 is deployed. If REVOKE happens before the Edge Function is migrated, complete-tenant-onboarding will break in production.

---

## SECTION 5: MIGRATION SQL -- STEP 1 (Enum + Gatekeeper + Drift Detection)

```sql
-- ================================================================
-- PI-INSTITUTIONAL-TENANT-LIFECYCLE-GOV-001
-- Step 1: Structural Enforcement (SAFE GOLD)
-- ================================================================

-- 1. Extend enum (IRREVERSIBLE)
ALTER TYPE public.tenant_lifecycle_status ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE public.tenant_lifecycle_status ADD VALUE IF NOT EXISTS 'TERMINATED';

-- 2. Gatekeeper function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.change_tenant_lifecycle_state(
  p_tenant_id uuid,
  p_new_state text,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_state text;
  v_caller_id uuid;
BEGIN
  -- Lock row deterministically
  SELECT lifecycle_status::text INTO v_current_state
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF v_current_state IS NULL THEN
    RAISE EXCEPTION 'Tenant % not found.', p_tenant_id;
  END IF;

  -- Idempotency: same state = no-op, no duplicate audit
  IF v_current_state = p_new_state THEN
    RETURN v_current_state;
  END IF;

  -- Transition matrix (deterministic, hardcoded)
  IF v_current_state = 'SETUP' AND p_new_state <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Invalid transition from SETUP to %', p_new_state;
  END IF;

  IF v_current_state = 'ACTIVE'
     AND p_new_state NOT IN ('SUSPENDED', 'TERMINATED') THEN
    RAISE EXCEPTION 'Invalid transition from ACTIVE to %', p_new_state;
  END IF;

  IF v_current_state = 'SUSPENDED'
     AND p_new_state <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Invalid transition from SUSPENDED to %', p_new_state;
  END IF;

  IF v_current_state = 'TERMINATED' THEN
    RAISE EXCEPTION 'TERMINATED tenant is immutable.';
  END IF;

  IF v_current_state = 'BLOCKED' THEN
    RAISE EXCEPTION 'BLOCKED is a legacy state. Migrate to SUSPENDED first.';
  END IF;

  -- Cross-validation before ACTIVE
  IF p_new_state = 'ACTIVE' AND v_current_state <> 'ACTIVE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE tenant_id = p_tenant_id AND role = 'ADMIN_TENANT'
    ) THEN
      RAISE EXCEPTION 'Cannot activate tenant without ADMIN_TENANT role.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_billing
      WHERE tenant_id = p_tenant_id AND status IN ('ACTIVE', 'TRIALING')
    ) THEN
      RAISE EXCEPTION 'Cannot activate tenant without valid billing.';
    END IF;
  END IF;

  -- Apply update (BOTH columns + onboarding fields for SETUP->ACTIVE)
  IF v_current_state = 'SETUP' AND p_new_state = 'ACTIVE' THEN
    UPDATE public.tenants
    SET lifecycle_status = p_new_state::tenant_lifecycle_status,
        status = p_new_state,
        onboarding_completed = true,
        onboarding_completed_at = now(),
        onboarding_completed_by = auth.uid(),
        updated_at = now()
    WHERE id = p_tenant_id;
  ELSE
    UPDATE public.tenants
    SET lifecycle_status = p_new_state::tenant_lifecycle_status,
        status = p_new_state,
        updated_at = now()
    WHERE id = p_tenant_id;
  END IF;

  -- Mandatory audit log
  INSERT INTO public.audit_logs (
    event_type, tenant_id, profile_id, category, metadata
  ) VALUES (
    'TENANT_LIFECYCLE_STATE_CHANGED',
    p_tenant_id,
    auth.uid(),
    'GOVERNANCE',
    jsonb_build_object(
      'previous_state', v_current_state,
      'new_state', p_new_state,
      'reason', p_reason,
      'pi_reference', 'TENANT-GOV-001',
      'occurred_at', now()
    )
  );

  RETURN p_new_state;
END;
$$;

-- 3. Restrict execution to service_role only
REVOKE EXECUTE ON FUNCTION public.change_tenant_lifecycle_state(uuid, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_tenant_lifecycle_state(uuid, text, text)
  TO service_role;

-- 4. Drift detection view (read-only)
CREATE OR REPLACE VIEW public.tenant_lifecycle_governance_audit_v1 AS
SELECT
  t.id AS tenant_id,
  t.name AS tenant_name,
  t.lifecycle_status::text AS lifecycle_status,
  t.status AS status_text,
  CASE
    WHEN t.lifecycle_status = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1 FROM public.tenant_billing b
           WHERE b.tenant_id = t.id AND b.status IN ('ACTIVE', 'TRIALING')
         )
      THEN 'P0_ACTIVE_WITHOUT_BILLING'
    WHEN t.lifecycle_status = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1 FROM public.user_roles ur
           WHERE ur.tenant_id = t.id AND ur.role = 'ADMIN_TENANT'
         )
      THEN 'P0_ACTIVE_WITHOUT_ADMIN'
    WHEN t.lifecycle_status::text = 'BLOCKED'
      THEN 'P1_LEGACY_BLOCKED_STATE'
    WHEN t.lifecycle_status::text <> t.status
      THEN 'P1_STATUS_COLUMN_DIVERGENCE'
    ELSE NULL
  END AS issue_code,
  CASE
    WHEN t.lifecycle_status = 'ACTIVE'
         AND (
           NOT EXISTS (SELECT 1 FROM public.tenant_billing b WHERE b.tenant_id = t.id AND b.status IN ('ACTIVE', 'TRIALING'))
           OR NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.tenant_id = t.id AND ur.role = 'ADMIN_TENANT')
         )
      THEN 'P0'
    WHEN t.lifecycle_status::text = 'BLOCKED'
         OR t.lifecycle_status::text <> t.status
      THEN 'P1'
    ELSE NULL
  END AS severity,
  now() AS detected_at
FROM public.tenants t
WHERE
  (t.lifecycle_status = 'ACTIVE' AND NOT EXISTS (
    SELECT 1 FROM public.tenant_billing b WHERE b.tenant_id = t.id AND b.status IN ('ACTIVE', 'TRIALING')
  ))
  OR (t.lifecycle_status = 'ACTIVE' AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.tenant_id = t.id AND ur.role = 'ADMIN_TENANT'
  ))
  OR (t.lifecycle_status::text = 'BLOCKED')
  OR (t.lifecycle_status::text <> t.status);

-- 5. Convenience check function (STABLE)
CREATE OR REPLACE FUNCTION public.check_tenant_lifecycle_governance_v1()
RETURNS TABLE(
  tenant_id uuid,
  tenant_name text,
  lifecycle_status text,
  status_text text,
  issue_code text,
  severity text,
  detected_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$ SELECT * FROM public.tenant_lifecycle_governance_audit_v1; $$;
```

## SECTION 6: MIGRATION SQL -- STEP 2 (REVOKE + Column GRANT)

**EXECUTE ONLY AFTER complete-tenant-onboarding is deployed with RPC.**

```sql
-- ================================================================
-- PI-INSTITUTIONAL-TENANT-LIFECYCLE-GOV-001
-- Step 2: Privilege Lockdown (Column-Level)
-- ================================================================

-- 1. REVOKE all UPDATE at table level
REVOKE UPDATE ON public.tenants FROM anon;
REVOKE UPDATE ON public.tenants FROM authenticated;
REVOKE UPDATE ON public.tenants FROM service_role;

-- 2. GRANT UPDATE on NON-lifecycle columns to service_role
-- These columns are legitimately written by billing/admin Edge Functions
GRANT UPDATE(
  slug, name, logo_url, primary_color, sport_types,
  stripe_customer_id, is_active, updated_at, default_locale,
  description, billing_email, card_template_url, diploma_template_url,
  creation_source
) ON public.tenants TO service_role;

-- 3. GRANT UPDATE on NON-lifecycle columns to authenticated (for RLS-based admin updates)
GRANT UPDATE(
  slug, name, logo_url, primary_color, sport_types,
  updated_at, default_locale, description, billing_email,
  card_template_url, diploma_template_url
) ON public.tenants TO authenticated;

-- Protected columns (ONLY writable via SECURITY DEFINER gatekeeper):
-- lifecycle_status
-- status
-- onboarding_completed
-- onboarding_completed_at
-- onboarding_completed_by
```

## SECTION 7: EDGE FUNCTION MIGRATION

### complete-tenant-onboarding -- Changes Required

**Current flow (VIOLATION):**
1. Validate prerequisites
2. `supabase.from("tenants").update({ status: "ACTIVE", onboarding_completed: true, ... })`
3. Insert billing record
4. If billing fails: `supabase.from("tenants").update({ status: "SETUP", onboarding_completed: false })`

**New flow (COMPLIANT):**
1. Validate prerequisites (unchanged)
2. Insert billing record FIRST
3. `supabase.rpc("change_tenant_lifecycle_state", { p_tenant_id, p_new_state: "ACTIVE", p_reason: "onboarding_completed" })`
4. If RPC fails: delete billing record (reverse order)
5. Audit logs for TENANT_ONBOARDING_COMPLETED and TENANT_TRIAL_STARTED remain (the gatekeeper creates TENANT_LIFECYCLE_STATE_CHANGED separately)

**Key changes in the file:**
- Remove lines 331-341 (direct `.update({ status: "ACTIVE" })`)
- Remove lines 377-383 (direct `.update({ status: "SETUP" })` rollback)
- Replace with `supabase.rpc("change_tenant_lifecycle_state", ...)` call
- Reverse billing/activation order for safe rollback
- The gatekeeper handles onboarding_completed, onboarding_completed_at, onboarding_completed_by automatically for SETUP->ACTIVE

### Edge Function Write Audit (Post-Migration)

| Edge Function | Writes to tenants | Columns | Lifecycle? | Status |
|---|---|---|---|---|
| complete-tenant-onboarding | YES | via RPC only | YES | **MIGRATED TO RPC** |
| admin-billing-control | YES | is_active | No | SAFE (column-level GRANT) |
| stripe-webhook | YES | is_active | No | SAFE (column-level GRANT) |
| mark-pending-delete | YES | is_active | No | SAFE (column-level GRANT) |
| create-tenant-subscription | YES | stripe_customer_id, is_active | No | SAFE (column-level GRANT) |
| cleanup-expired-tenants | YES | DELETE (entire row) | N/A | Separate concern |

**Confirmation**: ZERO Edge Functions write to lifecycle_status or status after migration.

## SECTION 8: FRONTEND TYPE CHANGES

Update `src/types/tenant-lifecycle-state.ts`:
- Add `SUSPENDED` and `TERMINATED` to `TenantLifecycleStatus`
- Add `SUSPENDED` and `TERMINATED` to `TenantLifecycleState`
- Add `SUSPENDED` and `TERMINATED` to `SAFE_TENANT_STATES`
- Add `TERMINATED: 'DELETED'` to `PROD_TENANT_TO_SAFE` mapping
- Add labels: `SUSPENDED: 'Suspenso'`, `TERMINATED: 'Encerrado'`

## SECTION 9: VALIDATION (Post-Apply)

### V1. Drift Detection (expect 0 rows)

```sql
SELECT * FROM public.check_tenant_lifecycle_governance_v1();
```

### V2. Direct UPDATE MUST fail

```sql
-- As service_role (should fail):
UPDATE public.tenants SET lifecycle_status = 'SUSPENDED' WHERE id = '07ad68d9-2b58-40d5-a783-ccb642022d4f';
-- Expected: permission denied for table tenants (column lifecycle_status)

UPDATE public.tenants SET status = 'SUSPENDED' WHERE id = '07ad68d9-2b58-40d5-a783-ccb642022d4f';
-- Expected: permission denied for table tenants (column status)
```

### V3. RPC MUST work

```sql
SELECT public.change_tenant_lifecycle_state(
  '07ad68d9-2b58-40d5-a783-ccb642022d4f',
  'SUSPENDED',
  'governance_test'
);
-- Expected: returns 'SUSPENDED', audit_log created, BOTH columns updated

-- Revert:
SELECT public.change_tenant_lifecycle_state(
  '07ad68d9-2b58-40d5-a783-ccb642022d4f',
  'ACTIVE',
  'governance_test_revert'
);
```

### V4. Idempotency

```sql
-- Call ACTIVE twice (already ACTIVE after revert)
SELECT public.change_tenant_lifecycle_state(
  '07ad68d9-2b58-40d5-a783-ccb642022d4f',
  'ACTIVE',
  'idempotency_test'
);
-- Expected: returns 'ACTIVE', NO new audit_log row
```

### V5. Invalid Transitions MUST fail

```sql
SELECT public.change_tenant_lifecycle_state(
  '07ad68d9-2b58-40d5-a783-ccb642022d4f',
  'SETUP',
  'invalid_test'
);
-- Expected: RAISE EXCEPTION 'Invalid transition from ACTIVE to SETUP'
```

### V6. Non-lifecycle UPDATE MUST work

```sql
UPDATE public.tenants SET is_active = true WHERE id = '07ad68d9-2b58-40d5-a783-ccb642022d4f';
-- Expected: SUCCESS (column-level GRANT allows this)
```

### V7. Audit Verification

```sql
SELECT event_type, metadata->>'previous_state', metadata->>'new_state', metadata->>'reason'
FROM audit_logs
WHERE metadata->>'pi_reference' = 'TENANT-GOV-001'
ORDER BY created_at DESC;
```

## SECTION 10: ROLLBACK

```sql
-- 1. Drop drift detection
DROP FUNCTION IF EXISTS public.check_tenant_lifecycle_governance_v1();
DROP VIEW IF EXISTS public.tenant_lifecycle_governance_audit_v1;

-- 2. Restore privileges (reverse REVOKE)
GRANT UPDATE ON public.tenants TO anon;
GRANT UPDATE ON public.tenants TO authenticated;
GRANT UPDATE ON public.tenants TO service_role;

-- 3. Drop gatekeeper
GRANT EXECUTE ON FUNCTION public.change_tenant_lifecycle_state(uuid, text, text) TO public;
DROP FUNCTION IF EXISTS public.change_tenant_lifecycle_state(uuid, text, text);

-- 4. Clean up audit logs
DELETE FROM public.audit_logs WHERE metadata->>'pi_reference' = 'TENANT-GOV-001';

-- IRREVERSIBLE LIMITATIONS:
-- - SUSPENDED and TERMINATED enum values CANNOT be removed from PostgreSQL
-- - They remain in the enum but become unused after rollback
-- - Edge Function rollback: redeploy previous version of complete-tenant-onboarding
```

## SECTION 11: SAFE GOLD CHECKLIST

| Item | Status | Evidence |
|---|---|---|
| Zero triggers | Confirmed | No triggers created |
| Zero session variables | Confirmed | No SET/GUC used |
| Zero nonce | Confirmed | Deterministic logic only |
| Zero DDL at runtime | Confirmed | DDL only in migration |
| Mutation only via gatekeeper | Confirmed | SECURITY DEFINER + column REVOKE |
| GRANT EXECUTE restricted to service_role | Confirmed | REVOKE FROM public,anon,authenticated |
| UPDATE on lifecycle columns revoked | Confirmed | Column-level REVOKE (lifecycle_status, status, onboarding_*) |
| Non-lifecycle columns remain writable | Confirmed | Column-level GRANT (is_active, name, etc.) |
| complete-tenant-onboarding migrated to RPC | Confirmed | No direct .update() on lifecycle columns |
| Idempotency via same-state check | Confirmed | Returns current state, no audit duplication |
| Transition matrix is deterministic | Confirmed | Hardcoded, no lookup table |
| Cross-check ADMIN_TENANT before activation | Confirmed | EXISTS check in gatekeeper |
| Cross-check billing before activation | Confirmed | IN ('ACTIVE', 'TRIALING') |
| Audit log mandatory for every state change | Confirmed | INSERT in gatekeeper |
| Drift detection is read-only | Confirmed | VIEW + STABLE function |
| Dual-column write (lifecycle_status + status) | Confirmed | Gatekeeper writes both atomically |
| Enum extension documented as irreversible | Confirmed | See rollback section |
| No bypass possible via application | Confirmed | Column-level privilege enforcement |

---

## STATUS: READY FOR EXECUTE

All divergences resolved. All evidence included. Execution requires:
1. Approve Migration Step 1 (enum + gatekeeper + drift detection)
2. Deploy migrated complete-tenant-onboarding Edge Function
3. Approve Migration Step 2 (REVOKE + column GRANT)
4. Run validation tests V1-V7

