

## Add `mapStripeStatusToBilling` to Billing State Machine

### What
Append a new exported function `mapStripeStatusToBilling` to the end of `supabase/functions/_shared/billing-state-machine.ts`. This consolidates the duplicated Stripe-to-BillingStatus mapping that currently exists in both `create-tenant-subscription/index.ts` and `stripe-webhook/index.ts`.

### Changes

**File: `supabase/functions/_shared/billing-state-machine.ts`**

Append the following function after the existing `assertBillingConsistency` function, at the end of the file:

```typescript
/**
 * Maps Stripe subscription status to canonical BillingStatus.
 * Single source of truth — used by stripe-webhook and create-tenant-subscription.
 *
 * @param stripeStatus - Stripe subscription.status string
 * @returns Canonical BillingStatus
 */
export function mapStripeStatusToBilling(stripeStatus: string): BillingStatus {
  const statusMap: Record<string, BillingStatus> = {
    active: "ACTIVE",
    past_due: "PAST_DUE",
    canceled: "CANCELED",
    incomplete: "INCOMPLETE",
    trialing: "TRIALING",
    unpaid: "UNPAID",
    incomplete_expired: "CANCELED",
    paused: "PAST_DUE",
  };
  return statusMap[stripeStatus] || "INCOMPLETE";
}
```

No other files are modified. All existing exports remain untouched.

### Validation

After the change, the module exports:
- `BillingStatus` (type)
- `BILLING_STATUSES` (const)
- `isKnownBillingStatus`
- `assertValidBillingTransition`
- `deriveTenantActive`
- `assertBillingConsistency`
- `mapStripeStatusToBilling` (new)

