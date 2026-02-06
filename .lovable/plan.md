
# P3.FINAL.FIX — Wizard Membership & Role Contract (SAFE GOLD)

## Analysis Summary

After reviewing the codebase, I found that the `resolve-identity-wizard` Edge Function **already implements atomic role creation with tenant rollback** (lines 563-580). The current implementation:

1. ✅ Creates tenant in SETUP mode
2. ✅ Assigns ADMIN_TENANT role
3. ✅ Rolls back tenant if role assignment fails
4. ✅ Has basic audit logging

### Key Clarification: Membership vs Role

The user's code sample references `memberships` table with `profile_id`, but:
- The `memberships` table uses `athlete_id` or `applicant_profile_id` (not `profile_id`)
- Memberships are for **athletes joining a tenant** (approval flow)
- The **wizard creates admins**, not athletes — admins get `user_roles` entries, not memberships

**Conclusion**: The "membership" in the user's prompt should be interpreted as ensuring the **role assignment is atomic**, which is already implemented. The enhancement needed is **observability via audit events**.

---

## Scope of Changes (SAFE GOLD)

| What | Status |
|------|--------|
| Add WIZARD domain to audit helper | ✅ NEW |
| Emit audit event on role failure | ✅ NEW |
| Enhanced structured logging | ✅ POLISH |
| No new tables | ✅ |
| No schema changes | ✅ |
| No Stripe changes | ✅ |
| No billing logic | ✅ |

---

## Tasks

### Task 1: Extend Audit Domain Types

**File**: `supabase/functions/_shared/emitBillingAuditEvent.ts`

Add `WIZARD` domain and new event types:

```typescript
export type AuditDomain = 
  | 'EVENTS' 
  | 'MEMBERSHIPS' 
  | 'RANKINGS' 
  | 'GRADINGS' 
  | 'ACADEMIES' 
  | 'COACHES' 
  | 'ATHLETES'
  | 'WIZARD';  // ← NEW

export type BillingAuditEventType = 
  | 'BILLING_WRITE_ALLOWED'
  | 'BILLING_WRITE_BLOCKED'
  | 'TENANT_NOT_ACTIVE_BLOCK'
  | 'BILLING_READ_ONLY_BLOCK'
  | 'BILLING_BLOCKED'
  | 'WIZARD_ADMIN_ASSIGN_FAILED';  // ← NEW
```

---

### Task 2: Emit Audit Event on Role Failure

**File**: `supabase/functions/resolve-identity-wizard/index.ts`

Import the audit helper and emit event when role assignment fails:

```typescript
// At top of file (after existing imports)
import { emitBillingAuditEvent } from "../_shared/emitBillingAuditEvent.ts";

// In handleWizardCompletion, when roleError occurs (lines 569-580):
if (roleError) {
  // Enhanced structured logging
  console.error("[WIZARD][ROLE_ASSIGN]", {
    tenantId: newTenant.id,
    userId,
    error: roleError.message,
    code: roleError.code,
    details: roleError.details,
  });

  // Best-effort audit event (P3.5 pattern)
  await emitBillingAuditEvent(supabase, {
    event_type: "WIZARD_ADMIN_ASSIGN_FAILED",
    tenant_id: newTenant.id,
    profile_id: userId,
    domain: "WIZARD",
    operation: "assign_admin_role",
    decision: "BLOCKED",
    tenant_status: "SETUP",
    billing_status: null,
    metadata: {
      error_code: roleError.code,
      error_message: roleError.message,
    },
  });

  // Rollback tenant creation (already exists)
  await supabase.from("tenants").delete().eq("id", newTenant.id);
  
  return {
    status: "ERROR",
    error: {
      code: "ROLE_ASSIGNMENT_FAILED",
      message: "Falha ao atribuir permissão de administrador.",
    },
  };
}
```

---

### Task 3: Enhanced Logging on Tenant Creation Failure

**File**: `supabase/functions/resolve-identity-wizard/index.ts`

The current logging (lines 502-515) is already good. We can add a minor enhancement for the sanity check failure:

```typescript
// Lines 536-549: Add audit event for invalid initial status
if (newTenant.status !== "SETUP") {
  console.error("[WIZARD][SANITY_CHECK]", {
    expected: "SETUP",
    actual: newTenant.status,
    tenantId: newTenant.id,
    userId,
  });

  // Best-effort audit
  await emitBillingAuditEvent(supabase, {
    event_type: "WIZARD_ADMIN_ASSIGN_FAILED",
    tenant_id: newTenant.id,
    profile_id: userId,
    domain: "WIZARD",
    operation: "tenant_sanity_check",
    decision: "BLOCKED",
    tenant_status: newTenant.status,
    billing_status: null,
    metadata: {
      expected_status: "SETUP",
      actual_status: newTenant.status,
    },
  });

  // Rollback (already exists)
  await supabase.from("tenants").delete().eq("id", newTenant.id);
  return { ... };
}
```

---

## Files Changed

| File | Action |
|------|--------|
| `supabase/functions/_shared/emitBillingAuditEvent.ts` | MODIFY (add WIZARD domain + event type) |
| `supabase/functions/resolve-identity-wizard/index.ts` | MODIFY (add audit events + enhanced logging) |

---

## What This Fix Guarantees

| Criterion | Status |
|-----------|--------|
| Tenant only exists if ADMIN role exists | ✅ Already implemented |
| No orphan tenants | ✅ Rollback on failure |
| Technical error logged with details | ✅ Enhanced with structured format |
| Audit event for diagnostic | ✅ NEW |
| UX message clear | ✅ Generic user-facing message |
| No impact on billing | ✅ |
| No impact on P4 | ✅ |

---

## Final Declaration

After implementing P3.FINAL.FIX:

```
P3.FINAL.FIX — Wizard Membership & Role Contract
STATUS: SAFE GOLD ✅

- Atomic role + tenant creation (already existed)
- Enhanced structured logging
- Audit events for failure diagnosis
- Rollback on any failure (already existed)
- No schema changes
- No new Edge Functions
- Build clean
```
