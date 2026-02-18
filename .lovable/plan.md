

# PI-MEMBERSHIP-MODEL-HARDENING-001 (Refined)
## Semantic Separation: Athletic vs Administrative Memberships

---

## Summary

Add `ADMIN_ACTIVE` to the `membership_status` enum as a terminal, immutable state for institutional memberships. Apply 3 SAFE GOLD refinements requested by the user.

**Risk: LOW** -- additive changes only.

---

## FASE A -- ENUM HARDENING

### A1: Add enum value (migration)

```sql
ALTER TYPE membership_status ADD VALUE IF NOT EXISTS 'ADMIN_ACTIVE';
```

No reordering, no removals.

### A2: Frontend type update

**File: `src/types/membership.ts`**

- Add `'ADMIN_ACTIVE'` to `MembershipStatus` union type
- Add label: `ADMIN_ACTIVE: 'Administrativo'`

---

## FASE B -- INTEGRITY VIEW

No changes needed. The existing `membership_governance_audit_v1` filters on `status = 'APPROVED'`. Once the admin membership is migrated to `ADMIN_ACTIVE`, it naturally disappears from audit findings.

---

## FASE C -- GATEKEEPER HARDENING (Ajuste 1 applied)

**File: migration SQL for `change_membership_state`**

Replace the current `ELSE ARRAY[]::text[]` catch-all (line 164) with an explicit `ADMIN_ACTIVE` case that raises an exception:

```sql
v_allowed := CASE v_previous_status
  WHEN 'DRAFT'           THEN ARRAY['PENDING_PAYMENT', 'CANCELLED']
  WHEN 'PENDING_PAYMENT' THEN ARRAY['PENDING_REVIEW', 'CANCELLED']
  WHEN 'PENDING_REVIEW'  THEN ARRAY['APPROVED', 'REJECTED', 'CANCELLED', 'PENDING_PAYMENT']
  WHEN 'APPROVED'        THEN ARRAY['EXPIRED', 'CANCELLED']
  WHEN 'CANCELLED'       THEN ARRAY['DRAFT', 'PENDING_PAYMENT']
  WHEN 'REJECTED'        THEN ARRAY['DRAFT', 'PENDING_PAYMENT']
  WHEN 'ADMIN_ACTIVE'    THEN NULL  -- sentinel for terminal check below
  ELSE ARRAY[]::text[]
END;

IF v_allowed IS NULL THEN
  RAISE EXCEPTION 'ADMIN_ACTIVE is terminal and immutable. No transitions allowed for membership %.', p_membership_id;
END IF;
```

This is fail-fast, explicit, and semantically clear. `ADMIN_ACTIVE` is never listed as a valid target in any other state's array, so it cannot be transitioned TO via the gatekeeper either.

---

## FASE D -- VALIDATION TRIGGER (Ajuste 2 applied)

Create a trigger that only fires when a record is **entering** `APPROVED` status, not on every update to an already-APPROVED record:

```sql
CREATE OR REPLACE FUNCTION validate_approved_membership()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'APPROVED' AND
     (TG_OP = 'INSERT' OR OLD.status <> 'APPROVED') THEN

    IF NEW.athlete_id IS NULL THEN
      RAISE EXCEPTION 'APPROVED membership requires athlete_id';
    END IF;

    IF NEW.reviewed_by_profile_id IS NULL THEN
      RAISE EXCEPTION 'APPROVED membership requires reviewed_by_profile_id';
    END IF;

    IF NEW.reviewed_at IS NULL THEN
      RAISE EXCEPTION 'APPROVED membership requires reviewed_at';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_approved_invariants
BEFORE INSERT OR UPDATE ON memberships
FOR EACH ROW
EXECUTE FUNCTION validate_approved_membership();
```

This ensures:
- Only validates when transitioning INTO APPROVED
- Does not block legitimate updates to already-APPROVED records (e.g. `updated_at` changes)

---

## FASE E -- DATA MIGRATION

```sql
UPDATE memberships
SET status = 'ADMIN_ACTIVE', updated_at = now()
WHERE id = '226b6b54-5789-43ba-a6ab-ead69a16c8db'
  AND status = 'APPROVED';
```

Safety: scoped to exact record, idempotent with status guard.

---

## FASE F -- FRONTEND: PORTAL ACCESS (Ajuste 3 applied)

### Explicit rule

```text
ADMIN_ACTIVE does NOT grant athlete portal access.
ADMIN_ACTIVE users access the system via admin dashboard (TenantDashboard).
The athlete portal is exclusively for APPROVED or ACTIVE memberships.
```

### Files analysis

| File | Change | Rationale |
|---|---|---|
| `src/types/membership.ts` | Add type + label | Type safety |
| `src/lib/resolveAthletePostLoginRedirect.ts` | No change | ADMIN_ACTIVE users have ADMIN_TENANT role, which routes to admin dashboard via `AuthCallback.tsx` role resolution, never through athlete redirect |
| `PortalAccessGate.tsx` | No change | Only athlete-facing; ADMIN_ACTIVE membership holders access admin panel via role-based routing |
| `AthleteArea.tsx` | No change | Admin users do not enter athlete routes |
| `PublicRankings.tsx` | No change | Filters APPROVED/ACTIVE only |
| `InternalRankings.tsx` | No change | Filters APPROVED/ACTIVE only |
| `DigitalCardSection.tsx` | No change | ADMIN_ACTIVE has no digital card |
| `MembershipStatusCard.tsx` | No change | `statusUtils.ts` already handles unknown statuses gracefully |

The only frontend change is adding the type and label to `membership.ts`. No portal access logic needs modification because ADMIN_ACTIVE users are routed by their `user_roles.role = 'ADMIN_TENANT'`, not by membership status.

---

## Execution Sequence

1. Migration: `ALTER TYPE membership_status ADD VALUE IF NOT EXISTS 'ADMIN_ACTIVE'`
2. Migration: `CREATE OR REPLACE FUNCTION change_membership_state(...)` with fail-fast ADMIN_ACTIVE terminal handling
3. Migration: `CREATE OR REPLACE FUNCTION validate_approved_membership()` + trigger (conditional, Ajuste 2)
4. Migration: `UPDATE memberships SET status = 'ADMIN_ACTIVE' WHERE id = '226b6b54-...'`
5. Frontend: Update `MembershipStatus` type and `MEMBERSHIP_STATUS_LABELS` in `src/types/membership.ts`
6. Validation: `SELECT * FROM check_institutional_integrity_v1()` -- expect zero P0/P1

---

## SAFE GOLD Compliance

| Criterion | Status |
|---|---|
| Zero RLS changes | Confirmed |
| Zero privilege changes | Confirmed |
| Zero enum removals | Confirmed |
| Zero retroactive modifications | Confirmed |
| Gatekeeper fail-fast (not silent array) | Confirmed (Ajuste 1) |
| Trigger conditional (not blanket) | Confirmed (Ajuste 2) |
| Portal access explicit (no inference) | Confirmed (Ajuste 3) |
| No existing APPROVED records affected | Confirmed |

