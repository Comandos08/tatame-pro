

# A03 — Billing State Machine Integrity Hardening (with 3 mandatory adjustments)

## Overview

Formalize the billing lifecycle as a deterministic state machine with explicit transition validation, enforced at the backend (`stripe-webhook`) level. All three review adjustments are incorporated.

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/_shared/billing-state-machine.ts` | NEW -- state machine, transitions, guards, helpers |
| `supabase/functions/stripe-webhook/index.ts` | Import + integrate validation in `handleSubscriptionChange` and `handleSubscriptionDeleted` |
| `supabase/functions/_shared/audit-logger.ts` | Add `BILLING_TRANSITION_BLOCKED` event constant |
| `.github/workflows/supabase-check.yml` | Add G5 gate (hardened) |

## What Does NOT Change

- No database migrations
- No RLS changes
- No route changes
- No Stripe contract changes (webhook always returns 200)
- No frontend changes
- No `console.*` (uses `createBackendLogger` exclusively)

---

## Phase 1 -- State Machine Definition (New File)

**File:** `supabase/functions/_shared/billing-state-machine.ts`

Contents:

- `BillingStatus` type with all 8 states
- `BILLING_STATUSES` array for runtime membership check
- `isKnownBillingStatus(value)` -- type guard (Adjustment 1)
- `ALLOWED_TRANSITIONS` map with CANCELED reachable from every non-terminal state (Adjustment 2)
- `assertValidBillingTransition(from, to)` -- throws on invalid (fail-closed)
- `deriveTenantActive(status)` -- pure boolean derivation
- `assertBillingConsistency(billingStatus, tenantIsActive)` -- post-update integrity check

### Transition Map (Adjustment 2 applied)

```text
TRIALING ---------> ACTIVE, TRIAL_EXPIRED, CANCELED
ACTIVE -----------> PAST_DUE, CANCELED
PAST_DUE ---------> ACTIVE, UNPAID, CANCELED
UNPAID -----------> ACTIVE, CANCELED
CANCELED ---------> (terminal)
INCOMPLETE -------> ACTIVE, CANCELED
TRIAL_EXPIRED ----> ACTIVE, PENDING_DELETE, CANCELED
PENDING_DELETE ---> ACTIVE, CANCELED
```

CANCELED is reachable from every non-terminal state, ensuring Stripe `customer.subscription.deleted` events are never blocked.

---

## Phase 2 -- Integration in `handleSubscriptionChange`

**File:** `supabase/functions/stripe-webhook/index.ts` (lines ~552-620)

After `previousStatus` is fetched (line 552), insert validation block:

```text
1. If previousStatus is null/undefined -> allow (initial insert, no validation)
2. If previousStatus is not a known BillingStatus (isKnownBillingStatus returns false):
   - log.error("Unknown previous billing status", { previousStatus })
   - Emit BILLING_TRANSITION_BLOCKED audit event with reason "unknown_previous_status"
   - Allow the update (do NOT block -- this is a data corruption scenario, not a business rule)
3. If previousStatus is known AND equals billingStatus -> skip validation (no-op transition)
4. Otherwise -> call assertValidBillingTransition(previousStatus, billingStatus)
   - If throws: log.error, emit BILLING_TRANSITION_BLOCKED audit, return early (skip DB writes)
   - The outer handler still returns HTTP 200 to Stripe
```

Replace inline `is_active` derivation (line 620):

```typescript
// BEFORE:
const isActive = billingStatus === "ACTIVE" || billingStatus === "TRIALING";

// AFTER:
const isActive = deriveTenantActive(billingStatus as BillingStatus);
```

After both DB writes (tenant_billing + tenants.is_active), call `assertBillingConsistency`:

```text
- If throws: log.error + audit BILLING_TRANSITION_BLOCKED with reason "consistency_mismatch"
- Do NOT return 500 (detection-only safety net)
```

---

## Phase 3 -- Integration in `handleSubscriptionDeleted`

**File:** `supabase/functions/stripe-webhook/index.ts` (lines ~640-694)

Add previous status fetch before the update:

```text
1. Expand existing select to include "status" from tenant_billing
2. Apply same guard chain:
   - previousStatus null -> allow
   - previousStatus unknown -> log.error + audit + allow
   - previousStatus known -> assertValidBillingTransition(previousStatus, "CANCELED")
     - Will always pass since CANCELED is reachable from every non-terminal state
     - But formally validates the machine
3. Replace hardcoded `is_active: false` with `deriveTenantActive("CANCELED")`
```

---

## Phase 4 -- Audit Event

**File:** `supabase/functions/_shared/audit-logger.ts`

Add to `AUDIT_EVENTS`:

```typescript
BILLING_TRANSITION_BLOCKED: 'BILLING_TRANSITION_BLOCKED',
```

Metadata contract for this event:

```typescript
{
  previous_status: string | null,
  attempted_status: string,
  stripe_subscription_id: string,
  reason: 'invalid_transition' | 'unknown_previous_status' | 'consistency_mismatch',
  automatic: true,
  source: 'billing_state_machine',
}
```

---

## Phase 5 -- CI Gate G5 (Adjustment 3 -- hardened)

**File:** `.github/workflows/supabase-check.yml`

Add before Summary step:

```yaml
- name: G5 — Billing transitions must use assertValidBillingTransition
  run: |
    echo "Checking billing state machine enforcement..."
    WEBHOOK="supabase/functions/stripe-webhook/index.ts"
    FAILED=0

    # Must import billing-state-machine
    if ! grep -q "billing-state-machine" "$WEBHOOK"; then
      echo "FAIL: stripe-webhook does not import billing-state-machine"
      FAILED=1
    fi

    # Must call assertValidBillingTransition
    if ! grep -q "assertValidBillingTransition" "$WEBHOOK"; then
      echo "FAIL: stripe-webhook does not call assertValidBillingTransition"
      FAILED=1
    fi

    # Must call deriveTenantActive
    if ! grep -q "deriveTenantActive" "$WEBHOOK"; then
      echo "FAIL: stripe-webhook does not call deriveTenantActive"
      FAILED=1
    fi

    # Must appear in both handlers
    CHANGE_COUNT=$(grep -c "assertValidBillingTransition" "$WEBHOOK" || true)
    if [ "$CHANGE_COUNT" -lt 2 ]; then
      echo "FAIL: assertValidBillingTransition must be called in both handlers (found $CHANGE_COUNT)"
      FAILED=1
    fi

    if [ "$FAILED" -eq 1 ]; then exit 1; fi
    echo "G5 passed"
```

This ensures: import exists, function is called, it appears in both `handleSubscriptionChange` and `handleSubscriptionDeleted`, and `deriveTenantActive` replaces inline logic.

---

## Adjustment Summary

| # | Issue | Resolution |
|---|---|---|
| 1 | `previousStatus` can be null/undefined/corrupt | Added `isKnownBillingStatus` guard; unknown values are audited but not blocked (data corruption scenario) |
| 2 | CANCELED must be reachable from any state | Updated transition map: every non-terminal state includes CANCELED |
| 3 | G5 CI gate too weak | Hardened to check import, both handler calls, and `deriveTenantActive` usage |

