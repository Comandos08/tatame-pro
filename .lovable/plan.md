
# A04.S1 — Critical Financial & Admin Hardening

## Overview

Three surgical changes: (1) invoice handlers enter the A03 billing state machine, (2) admin-billing-control validates all transitions, (3) admin routes get explicit RequireRoles guards.

## What Does NOT Change

- No database migrations, no RLS changes, no route structure changes
- No Stripe contract changes (webhook always returns 200)
- No changes to billing-state-machine.ts, A02, A03, or A07 envelope
- No `console.*` additions

---

## Part 1 -- Invoice Handlers (stripe-webhook/index.ts)

### 1A. handleInvoicePaymentSucceeded (lines 900-958)

**Line 921:** Expand `.select("id, tenant_id")` to `.select("id, tenant_id, status")`

**Lines 932-941:** Replace the direct updates with state machine validation:

```text
1. Extract previousStatus = billing.status
2. If previousStatus is known (isKnownBillingStatus) and !== "ACTIVE":
   - try assertValidBillingTransition(previousStatus, "ACTIVE")
   - on throw: log.error + createAuditLog(BILLING_TRANSITION_BLOCKED) + return (skip writes)
3. If previousStatus is unknown string: log.error, allow (data corruption scenario)
4. const isActive = deriveTenantActive("ACTIVE" as BillingStatus)
5. Update tenant_billing.status = "ACTIVE"
6. Update tenants.is_active = isActive (replaces hardcoded true)
```

### 1B. handleInvoicePaymentFailed (lines 960-1021)

**Line 980:** Expand `.select("id, tenant_id")` to `.select("id, tenant_id, status")`

**Lines 991-995:** Replace direct update with state machine validation:

```text
1. Extract previousStatus = billing.status
2. If previousStatus is known and !== "PAST_DUE":
   - try assertValidBillingTransition(previousStatus, "PAST_DUE")
   - on throw: log.error + createAuditLog(BILLING_TRANSITION_BLOCKED) + return
3. If previousStatus unknown: log.error, allow
4. const isActive = deriveTenantActive("PAST_DUE" as BillingStatus)
5. Update tenant_billing.status = "PAST_DUE"
6. ADD: Update tenants.is_active = isActive (CRITICAL FIX -- today this is missing)
```

The missing `tenants.is_active` update on payment failure is a real bug: PAST_DUE tenants remain operationally active until a subscription-level event fires.

---

## Part 2 -- admin-billing-control/index.ts

### 2A. Add imports (after line 20)

```typescript
import { AUDIT_EVENTS } from "../_shared/audit-logger.ts";
import {
  type BillingStatus,
  isKnownBillingStatus,
  assertValidBillingTransition,
  deriveTenantActive,
  assertBillingConsistency,
} from "../_shared/billing-state-machine.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
```

### 2B. Main handler (line 509): Create logger instance

```typescript
const correlationId = extractCorrelationId(req);
const log = createBackendLogger("admin-billing-control", correlationId);
```

### 2C. extendTrial (lines 148-212)

After fetching `before.billing` (line 160), before update (line 173):

```text
1. const previousStatus = before.billing.status
2. If known and !== "TRIALING":
   - try assertValidBillingTransition(previousStatus, "TRIALING")
   - catch: return { success: false, error: `Invalid transition: ${previousStatus} -> TRIALING` }
3. After billing update (line 180), ADD:
   - const isActive = deriveTenantActive("TRIALING" as BillingStatus)
   - await serviceClient.from("tenants").update({ is_active: isActive }).eq("id", tenantId)
4. Post-write: try { assertBillingConsistency("TRIALING", isActive) } catch { log.error(...) }
```

### 2D. markAsPaid (lines 214-277)

Same pattern: validate previousStatus -> "ACTIVE", add `tenants.is_active` update with `deriveTenantActive("ACTIVE")`, post-write consistency check.

### 2E. blockTenant (lines 279-335)

Validate previousStatus -> "PAST_DUE". ADD `tenants.is_active` update with `deriveTenantActive("PAST_DUE")` (returns false). Post-write consistency.

### 2F. unblockTenant (lines 337-389)

Validate previousStatus -> "ACTIVE". ADD `tenants.is_active` update with `deriveTenantActive("ACTIVE")`. Post-write consistency.

### 2G. resetToStripe (lines 391-506)

After resolving `stripeStatus` (line 431/461):
- If `isKnownBillingStatus(stripeStatus)` and previous is known and different: validate transition
- After billing update: ADD `tenants.is_active` update with `deriveTenantActive` (guarded by isKnownBillingStatus)
- Post-write consistency

### 2H. Replace console.error (lines 435, 466, 652)

Replace 3 instances of `console.error` with `log.error`.

---

## Part 3 -- Admin Routes (src/App.tsx)

**Add import:** `import { RequireRoles } from "@/components/auth/RequireRoles";`

**Wrap all 7 admin routes** with `<RequireRoles allowed={['SUPERADMIN_GLOBAL']}>`:

| Route | Lines |
|---|---|
| `/admin` | ~80 |
| `/admin/health` | ~81 |
| `/admin/audit` | ~82 |
| `/admin/security` | ~83 |
| `/admin/diagnostics` | ~84 |
| `/admin/landing` | ~85 |
| `/admin/tenants/:tenantId/control` | ~86 |

---

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/stripe-webhook/index.ts` | Invoice handlers: state machine validation + is_active fix |
| `supabase/functions/admin-billing-control/index.ts` | All 5 actions: transition validation + is_active updates + replace console.error |
| `src/App.tsx` | 7 admin routes wrapped with RequireRoles |

## Mental Tests

| Scenario | Expected |
|---|---|
| CANCELED -> ACTIVE via invoice | BLOCKED + audit |
| ACTIVE -> ACTIVE via invoice (no-op) | Allowed (skip validation) |
| CANCELED -> TRIALING via extendTrial | BLOCKED |
| ACTIVE -> PAST_DUE via blockTenant | Allowed |
| ADMIN_TENANT navigates /admin | Blocked by RequireRoles |
| invoice.payment_failed fires | tenants.is_active set to false |
| Webhook never returns 500 | Guaranteed (return after audit) |
