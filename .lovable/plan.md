

# PI-INSTITUTIONAL-TENANT-LIFECYCLE-GOV-002 (SAFE GOLD -- READ-ONLY)

## Enhanced Drift Detection v2

---

## SECTION 1: AUDIT EVIDENCE (READ-ONLY)

### E1. Tenant Columns

| Column | Type | Default | Nullable |
|---|---|---|---|
| lifecycle_status | USER-DEFINED (tenant_lifecycle_status) | 'ACTIVE' | NO |
| status | text | 'ACTIVE' | NO |
| is_active | boolean | true | YES |
| onboarding_completed | boolean | false | YES |
| updated_at | timestamptz | now() | YES |

### E2. Enum Values

```
tenant_lifecycle_status = { SETUP, ACTIVE, BLOCKED, SUSPENDED, TERMINATED }
```

SUSPENDED and TERMINATED were added by PI-GOV-001.

### E3. Billing Status Enum

```
billing_status = { ACTIVE, PAST_DUE, CANCELED, INCOMPLETE, TRIALING, UNPAID, TRIAL_EXPIRED, PENDING_DELETE }
```

Valid billing for an ACTIVE tenant: IN ('ACTIVE', 'TRIALING').

### E4. Current Data (1 tenant)

| Field | Value |
|---|---|
| id | 07ad68d9 |
| name | Tier One Grappling School |
| lifecycle_status | ACTIVE |
| status | ACTIVE |
| is_active | true |
| onboarding_completed | true |
| billing_status | TRIALING |
| admin_count | 1 |

Healthy state: 0 drift rows expected from v2 view.

### E5. Existing v1 Artifacts

- `tenant_lifecycle_governance_audit_v1` (VIEW) -- exists
- `check_tenant_lifecycle_governance_v1()` (FUNCTION) -- exists

v2 will NOT modify or drop v1. Both coexist.

### E6. Audit Logs

```
TENANT_LIFECYCLE_STATE_CHANGED events: 0
```

No lifecycle transitions have occurred yet (tenant was created before the gatekeeper was deployed).

---

## SECTION 2: DRIFT DEFINITIONS

### P0 (Critical -- Invariant Violations)

| issue_code | Condition | Rationale |
|---|---|---|
| P0_ACTIVE_WITHOUT_BILLING | lifecycle_status = ACTIVE AND no billing row with status IN (ACTIVE, TRIALING) | Active tenant MUST have valid billing |
| P0_ACTIVE_WITHOUT_ADMIN | lifecycle_status = ACTIVE AND no user_role with role = ADMIN_TENANT | Active tenant MUST have at least one admin |
| P0_TERMINATED_WITH_ACTIVE_BILLING | lifecycle_status = TERMINATED AND billing status IN (ACTIVE, TRIALING) | Terminated tenant MUST NOT have active billing |
| P0_SUSPENDED_WITH_ACTIVE_BILLING | lifecycle_status = SUSPENDED AND billing status IN (ACTIVE, TRIALING) AND is_active = true | Suspended tenant with active billing AND is_active=true indicates incomplete suspension |

### P1 (Warning -- Consistency Issues)

| issue_code | Condition | Rationale |
|---|---|---|
| P1_STATUS_COLUMN_DIVERGENCE | lifecycle_status::text != status | Dual-column must be in sync (gatekeeper writes both) |
| P1_IS_ACTIVE_LIFECYCLE_CONFLICT | is_active = false AND lifecycle_status = ACTIVE | is_active contradicts lifecycle state |
| P1_LEGACY_BLOCKED_STATE | lifecycle_status = BLOCKED | BLOCKED is legacy; should be migrated to SUSPENDED |

---

## SECTION 3: CONSTRAINTS

- ZERO triggers
- ZERO session variables / GUC
- ZERO nonces
- ZERO RLS changes
- ZERO privilege changes
- ZERO PL/pgSQL (pure SQL, set-based)
- Read-only artifacts only (VIEW + STABLE FUNCTION)
- No SECURITY DEFINER (not needed for read-only)

---

## SECTION 4: MIGRATION SQL

### 4.1 View: `public.tenant_lifecycle_governance_audit_v2`

```sql
CREATE OR REPLACE VIEW public.tenant_lifecycle_governance_audit_v2 AS
WITH tenant_billing_agg AS (
  SELECT
    tb.tenant_id,
    tb.status AS billing_status
  FROM public.tenant_billing tb
),
tenant_admin_count AS (
  SELECT
    ur.tenant_id,
    count(*) AS admin_count
  FROM public.user_roles ur
  WHERE ur.role = 'ADMIN_TENANT'
  GROUP BY ur.tenant_id
),
base AS (
  SELECT
    t.id AS tenant_id,
    t.name AS tenant_name,
    t.lifecycle_status::text AS lifecycle_status,
    t.status AS status_text,
    t.is_active,
    tba.billing_status::text AS billing_status,
    COALESCE(tac.admin_count, 0) AS admin_count
  FROM public.tenants t
  LEFT JOIN tenant_billing_agg tba ON tba.tenant_id = t.id
  LEFT JOIN tenant_admin_count tac ON tac.tenant_id = t.id
),
checks AS (
  SELECT
    b.*,
    -- P0 checks
    CASE WHEN b.lifecycle_status = 'ACTIVE'
         AND (b.billing_status IS NULL OR b.billing_status NOT IN ('ACTIVE', 'TRIALING'))
      THEN true ELSE false END AS p0_no_billing,
    CASE WHEN b.lifecycle_status = 'ACTIVE'
         AND b.admin_count = 0
      THEN true ELSE false END AS p0_no_admin,
    CASE WHEN b.lifecycle_status = 'TERMINATED'
         AND b.billing_status IN ('ACTIVE', 'TRIALING')
      THEN true ELSE false END AS p0_terminated_billing,
    CASE WHEN b.lifecycle_status = 'SUSPENDED'
         AND b.billing_status IN ('ACTIVE', 'TRIALING')
         AND b.is_active = true
      THEN true ELSE false END AS p0_suspended_active,
    -- P1 checks
    CASE WHEN b.lifecycle_status <> b.status_text
      THEN true ELSE false END AS p1_divergence,
    CASE WHEN b.is_active = false AND b.lifecycle_status = 'ACTIVE'
      THEN true ELSE false END AS p1_is_active_conflict,
    CASE WHEN b.lifecycle_status = 'BLOCKED'
      THEN true ELSE false END AS p1_legacy_blocked
  FROM base b
),
unpivoted AS (
  SELECT tenant_id, tenant_name, lifecycle_status, status_text, is_active,
    'P0_ACTIVE_WITHOUT_BILLING' AS issue_code, 'P0' AS severity,
    jsonb_build_object(
      'billing_status', COALESCE(billing_status, 'NO_RECORD'),
      'admin_count', admin_count
    ) AS details
  FROM checks WHERE p0_no_billing
  UNION ALL
  SELECT tenant_id, tenant_name, lifecycle_status, status_text, is_active,
    'P0_ACTIVE_WITHOUT_ADMIN', 'P0',
    jsonb_build_object(
      'billing_status', COALESCE(billing_status, 'NO_RECORD'),
      'admin_count', admin_count
    )
  FROM checks WHERE p0_no_admin
  UNION ALL
  SELECT tenant_id, tenant_name, lifecycle_status, status_text, is_active,
    'P0_TERMINATED_WITH_ACTIVE_BILLING', 'P0',
    jsonb_build_object(
      'billing_status', billing_status,
      'admin_count', admin_count
    )
  FROM checks WHERE p0_terminated_billing
  UNION ALL
  SELECT tenant_id, tenant_name, lifecycle_status, status_text, is_active,
    'P0_SUSPENDED_WITH_ACTIVE_BILLING', 'P0',
    jsonb_build_object(
      'billing_status', billing_status,
      'is_active', is_active,
      'admin_count', admin_count
    )
  FROM checks WHERE p0_suspended_active
  UNION ALL
  SELECT tenant_id, tenant_name, lifecycle_status, status_text, is_active,
    'P1_STATUS_COLUMN_DIVERGENCE', 'P1',
    jsonb_build_object(
      'lifecycle_status', lifecycle_status,
      'status_text', status_text
    )
  FROM checks WHERE p1_divergence
  UNION ALL
  SELECT tenant_id, tenant_name, lifecycle_status, status_text, is_active,
    'P1_IS_ACTIVE_LIFECYCLE_CONFLICT', 'P1',
    jsonb_build_object(
      'is_active', is_active,
      'lifecycle_status', lifecycle_status
    )
  FROM checks WHERE p1_is_active_conflict
  UNION ALL
  SELECT tenant_id, tenant_name, lifecycle_status, status_text, is_active,
    'P1_LEGACY_BLOCKED_STATE', 'P1',
    jsonb_build_object(
      'lifecycle_status', lifecycle_status
    )
  FROM checks WHERE p1_legacy_blocked
)
SELECT
  tenant_id,
  tenant_name,
  lifecycle_status,
  status_text,
  is_active,
  issue_code,
  severity,
  details,
  now() AS detected_at
FROM unpivoted;
```

### 4.2 Function: `public.check_tenant_lifecycle_governance_v2()`

```sql
CREATE OR REPLACE FUNCTION public.check_tenant_lifecycle_governance_v2()
RETURNS TABLE(
  tenant_id uuid,
  tenant_name text,
  lifecycle_status text,
  status_text text,
  is_active boolean,
  issue_code text,
  severity text,
  details jsonb,
  detected_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$ SELECT * FROM public.tenant_lifecycle_governance_audit_v2; $$;
```

---

## SECTION 5: ROLLBACK

```sql
DROP FUNCTION IF EXISTS public.check_tenant_lifecycle_governance_v2();
DROP VIEW IF EXISTS public.tenant_lifecycle_governance_audit_v2;
```

No irreversible changes. Complete rollback possible.

---

## SECTION 6: VALIDATION (Post-Apply)

### V1. Healthy environment returns 0 rows

```sql
SELECT * FROM public.check_tenant_lifecycle_governance_v2();
-- Expected: 0 rows (current tenant is ACTIVE with TRIALING billing and 1 ADMIN_TENANT)
```

### V2. View columns match spec

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tenant_lifecycle_governance_audit_v2'
ORDER BY ordinal_position;
-- Expected: tenant_id, tenant_name, lifecycle_status, status_text, is_active, issue_code, severity, details, detected_at
```

### V3. Function exists and is STABLE

```sql
SELECT proname, provolatile
FROM pg_proc
WHERE proname = 'check_tenant_lifecycle_governance_v2';
-- Expected: provolatile = 's' (STABLE)
```

---

## SECTION 7: SAFE GOLD CHECKLIST

| Item | Status | Evidence |
|---|---|---|
| Zero triggers | Confirmed | No triggers created |
| Zero session variables / GUC | Confirmed | No SET used (only search_path on function) |
| Zero nonces | Confirmed | Deterministic, set-based SQL only |
| Zero RLS changes | Confirmed | No policy modifications |
| Zero privilege changes | Confirmed | No GRANT/REVOKE |
| Zero PL/pgSQL | Confirmed | Pure SQL language for function |
| Read-only artifacts only | Confirmed | 1 VIEW + 1 STABLE FUNCTION |
| No SECURITY DEFINER | Confirmed | Not needed for read-only |
| Healthy env returns 0 rows | Confirmed | Current data passes all checks |
| Complete rollback possible | Confirmed | DROP FUNCTION + DROP VIEW |
| v1 artifacts untouched | Confirmed | No modifications to existing v1 view/function |

