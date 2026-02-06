
# P3.2 — Billing Contract coupled to Tenant Status

## Summary

This PI establishes the formal coupling between tenant lifecycle and billing, ensuring that:
- Billing only observes **ACTIVE** tenants (never SETUP)
- Trial is bootstrapped automatically when a tenant is activated
- Billing gates block operations without affecting onboarding
- Stripe webhook flow continues to work seamlessly

---

## Current State Analysis

### What Already Exists

| Component | Status | Notes |
|-----------|--------|-------|
| `tenant_billing` table | Complete | Has all required columns including trial tracking fields |
| `resolveTenantBillingState` | Complete | Core billing resolver with TRIALING/TRIAL_EXPIRED/PENDING_DELETE |
| `requireBillingStatus` (Edge) | Complete | Read-only gate for Edge Functions |
| `stripe-webhook` | Complete | Handles subscription lifecycle |
| `create-tenant-subscription` | Complete | Creates Stripe subscription with trial |
| `expire-trials` job | Complete | Transitions TRIALING → TRIAL_EXPIRED |
| `TenantBlockedScreen` | Complete | Handles blocked tenant UX |
| `TrialStatusBanner` | Complete | Progressive warning banners |
| `ActionBlockedTooltip` | Complete | Blocks sensitive actions |
| `useTenantStatus` hook | Complete | Provides billing state to frontend |

### What's Missing (Gap Analysis)

| Gap | Impact | Fix Required |
|-----|--------|-------------|
| **P3.2.2** — Billing bootstrap on activation | HIGH | `complete-tenant-onboarding` does NOT create `tenant_billing` row |
| **P3.2.3** — Frontend `BillingGate` component | MEDIUM | No unified gate for tenant billing status |
| **P3.2.6** — Suspension contract formal | LOW | Logic exists but not documented as contract |
| Billing enum missing in complete-onboarding | HIGH | Tenant can become ACTIVE without billing row |

---

## Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        TENANT LIFECYCLE                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   WIZARD                  ONBOARDING              OPERATIONS         │
│   ──────                  ──────────              ──────────         │
│                                                                      │
│   ┌────────┐              ┌────────┐              ┌────────┐         │
│   │ SETUP  │──complete───▶│ ACTIVE │──billing───▶│  LIVE  │         │
│   │        │  onboarding  │        │   gates     │        │         │
│   └────────┘              └────────┘              └────────┘         │
│       │                       │                       │              │
│       │                       │                       │              │
│       ▼                       ▼                       ▼              │
│   No billing              TRIAL row              Stripe              │
│   No gates                 created              webhooks             │
│   No trial               (automatic)            updates              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

                         BILLING STATE MACHINE
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   TRIALING (D0-D7)                                                   │
│       │                                                              │
│       ├───payment────▶ ACTIVE ◀──────payment────┐                    │
│       │                   │                      │                   │
│       ▼                   ▼                      │                   │
│   TRIAL_EXPIRED      PAST_DUE ──────────────────┘                    │
│   (D8-D15)               │                                           │
│       │                  ▼                                           │
│       ▼              CANCELED                                        │
│   PENDING_DELETE                                                     │
│   (D16-D22)                                                          │
│       │                                                              │
│       ▼                                                              │
│   [DELETED]                                                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Tasks

### P3.2.1 — Schema Review (NO CHANGES NEEDED)

The `tenant_billing` table already has all required columns:

- `tenant_id` (FK to tenants)
- `status` (ENUM: ACTIVE, TRIALING, TRIAL_EXPIRED, PENDING_DELETE, etc.)
- `trial_started_at`, `trial_expires_at`
- `grace_period_ends_at`, `scheduled_delete_at`
- `is_manual_override`, `override_by`, `override_reason`, `override_at`

**Status**: Schema complete. No migration required.

---

### P3.2.2 — Billing Bootstrap on Activation (CRITICAL)

**File**: `supabase/functions/complete-tenant-onboarding/index.ts`

**Current Problem**: When a tenant transitions from SETUP → ACTIVE, no billing row is created. This leaves the tenant without trial tracking.

**Fix**: After successful activation, atomically insert a `tenant_billing` row with `status: 'TRIALING'`.

```typescript
// AFTER: status = 'ACTIVE' update succeeds
// BEFORE: Returning success response

// ========================================================================
// P3.2.2 — BILLING BOOTSTRAP (ATOMIC WITH ACTIVATION)
// ========================================================================
const now = new Date();
const trialExpiresAt = new Date();
trialExpiresAt.setDate(trialExpiresAt.getDate() + 7); // TRIAL_PERIOD_DAYS

const { error: billingError } = await supabase
  .from("tenant_billing")
  .insert({
    tenant_id: tenantId,
    status: "TRIALING",
    trial_started_at: now.toISOString(),
    trial_expires_at: trialExpiresAt.toISOString(),
    plan_name: "Growth Trial",
  });

if (billingError) {
  // ROLLBACK: Revert tenant to SETUP if billing fails
  await supabase
    .from("tenants")
    .update({ 
      status: "SETUP", 
      onboarding_completed: false 
    })
    .eq("id", tenantId);

  logStep("Billing bootstrap failed, rolled back activation", { 
    error: billingError.message 
  });

  return new Response(
    JSON.stringify({ 
      ok: false, 
      error: "Failed to initialize billing", 
      code: "BILLING_INIT_FAILED" 
    }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Audit log for billing bootstrap
await supabase.from("audit_logs").insert({
  event_type: "TENANT_TRIAL_STARTED",
  tenant_id: tenantId,
  profile_id: user.id,
  metadata: {
    trial_started_at: now.toISOString(),
    trial_expires_at: trialExpiresAt.toISOString(),
    source: "complete-tenant-onboarding",
  },
});
```

**Contract**:
- Tenant ACTIVE always has a billing row
- Billing insert failure = activation rollback
- Trial starts immediately upon activation

---

### P3.2.3 — Frontend BillingGate Component

**File**: `src/components/billing/BillingGate.tsx` (NEW)

**Purpose**: Unified gate component that blocks access based on billing status.

```typescript
/**
 * BillingGate - Access control based on billing status
 * 
 * LOGIC:
 * - tenant.status !== 'ACTIVE' → Ignore billing (show children)
 * - billing.status in ['TRIALING', 'ACTIVE'] → Allow (show children)
 * - billing.status in ['TRIAL_EXPIRED'] → Partial block (show warning + children)
 * - billing.status in ['PENDING_DELETE', 'CANCELED', 'BLOCKED'] → Full block
 */

interface BillingGateProps {
  children: React.ReactNode;
  /** If true, blocks entirely instead of showing warning */
  strictMode?: boolean;
  /** Custom fallback component */
  fallback?: React.ReactNode;
}

export function BillingGate({ children, strictMode = false, fallback }: BillingGateProps) {
  const { tenant } = useTenant();
  const { billingState, isLoading } = useTenantStatus();

  // Ignore billing for non-ACTIVE tenants (still in SETUP)
  if (tenant?.status !== 'ACTIVE') {
    return <>{children}</>;
  }

  if (isLoading) {
    return <LoadingState />;
  }

  // Allowed states
  if (billingState?.status === 'ACTIVE' || billingState?.status === 'TRIALING') {
    return <>{children}</>;
  }

  // Blocked states
  if (billingState?.isBlocked || billingState?.status === 'PENDING_DELETE') {
    return fallback || (
      <BlockedStateCard
        icon={CreditCard}
        iconVariant="destructive"
        titleKey="billing.blocked.title"
        descriptionKey="billing.blocked.description"
        actions={[...]}
      />
    );
  }

  // Read-only state (TRIAL_EXPIRED, PAST_DUE)
  if (billingState?.isReadOnly && strictMode) {
    return fallback || <BlockedStateCard ... />;
  }

  // Default: show warning banner + children
  return (
    <>
      <BillingWarningBanner status={billingState?.status} />
      {children}
    </>
  );
}
```

---

### P3.2.4 — Stripe Contract (Already Complete)

The existing `create-tenant-subscription` Edge Function already handles:
- Creating Stripe customer
- Creating subscription with trial
- Mapping Stripe status to our enum
- Updating `tenant_billing` on checkout

**No changes needed** — this is read-only integration as specified.

---

### P3.2.5 — Webhook Handler (Already Complete)

The `stripe-webhook` function already handles:
- `customer.subscription.created/updated/deleted`
- `invoice.payment_succeeded/failed`
- Reactivation logic (TRIAL_EXPIRED → ACTIVE on payment)
- Status mapping and `tenant_billing` updates

**No changes needed** — webhook contract is stable.

---

### P3.2.6 — Tenant Suspension Contract (Documentation + Minor Fix)

**Current State**: Logic exists but needs formal documentation.

**Suspension Rules**:
1. `tenant_billing.status` = `PENDING_DELETE` or `CANCELED` → `tenants.is_active` = `false`
2. `tenant_billing.status` = `TRIAL_EXPIRED` → `tenants.is_active` = `true` (partial access)
3. Reactivation via Stripe payment → clear `grace_period_ends_at`, `scheduled_delete_at`

**Minor Fix**: Add explicit `SUSPENDED` status handling in `resolveTenantBillingState.ts`:

```typescript
// When billing is CANCELED or PENDING_DELETE, tenant should be SUSPENDED
// This is already handled by isBlocked flag, but add explicit mapping:
const isSuspended = status === 'CANCELED' || status === 'PENDING_DELETE';
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/complete-tenant-onboarding/index.ts` | MODIFY | Add billing bootstrap after activation |
| `src/components/billing/BillingGate.tsx` | CREATE | Unified billing access gate |
| `src/lib/billing/resolveTenantBillingState.ts` | VERIFY | Confirm SUSPENDED mapping |
| `src/locales/*.ts` | MODIFY | Add billing gate translation keys |

---

## SAFE GOLD Checklist

| Criterion | Status |
|-----------|--------|
| Tenant SETUP never touches billing | Ensured — billing only created on ACTIVE transition |
| Tenant ACTIVE always has billing row | Ensured — atomic insert with rollback |
| Billing never activates tenant | Ensured — billing only observes state |
| Suspension is reversible | Ensured — reactivation clears flags |
| Stripe doesn't create/delete tenants | Ensured — webhook only updates billing |
| No heuristics based on data existence | Ensured — explicit status checks |
| Gates are explicit | Ensured — BillingGate component |
| No impact on existing billing flows | Verified — webhook/subscription code untouched |
| Build clean expected | Yes |

---

## Testing Strategy

1. **Unit Test**: Billing bootstrap creates row with correct trial dates
2. **Integration Test**: SETUP → ACTIVE → billing row exists
3. **E2E Test**: Wizard → Onboarding → ACTIVE → Trial banner visible
4. **Regression Test**: Existing ACTIVE tenants unaffected
5. **Failure Test**: Billing insert failure rolls back activation

---

## Expected Outcome

After P3.2:
- Every tenant activation creates a billing row automatically
- Trial countdown starts immediately on activation
- Frontend can use `BillingGate` for access control
- Billing never interferes with onboarding flow
- Clear separation: Tenant lifecycle → Billing observes → Stripe syncs
