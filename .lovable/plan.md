

# Fail-Close the BillingGate Default Branch

## Problem

`BillingGate.tsx` has a permissive default branch at line 120:

```tsx
// Default: allow access
return <>{children}</>;
```

Any billing status not explicitly handled (e.g., an unexpected value from the RPC) falls through and grants access. This contradicts the documented fail-closed contract.

## Current Decision Flow

```text
tenant not ACTIVE?      --> pass through (correct, SETUP tenants bypass)
contract loading?       --> loader (correct)
ACTIVE or TRIALING?     --> allow (correct)
shouldBlock (BLOCKED/UNKNOWN/null)? --> block (correct)
PAST_DUE + strictMode?  --> block (correct)
PAST_DUE + !strictMode? --> warning + allow (correct)
DEFAULT                 --> allow (BUG: fail-open)
```

## Fix

Replace the final `return <>{children}</>` (line 120) with the same blocked UI used by `shouldBlock`. This ensures any unrecognized status is treated as BLOCKED.

### Before (line 118-120):
```tsx
  // Default: allow access
  return <>{children}</>;
```

### After:
```tsx
  // FAIL-CLOSED: Any unrecognized billing status is treated as blocked
  return (
    fallback || (
      <BlockedStateCard
        icon={CreditCard}
        iconVariant="destructive"
        titleKey="billing.gate.blocked.title"
        descriptionKey="billing.gate.blocked.description"
        actions={[
          {
            labelKey: "billing.gate.blocked.action",
            onClick: () => navigate(`/${tenant?.slug}/app/billing`),
            variant: "default",
          },
          {
            labelKey: "common.goBack",
            onClick: () => navigate(-1),
            variant: "outline",
          },
        ]}
      />
    )
  );
```

## Scope

- **1 file modified**: `src/components/billing/BillingGate.tsx`
- **0 new components**
- **No changes** to: PAST_DUE logic, strictMode, TenantFlagsContext, navigation patterns, or any other file

## Post-Change Decision Flow

```text
tenant not ACTIVE?           --> pass through (unchanged)
contract loading?            --> loader (unchanged)
ACTIVE or TRIALING?          --> allow (unchanged)
BLOCKED/UNKNOWN/null?        --> block (unchanged)
PAST_DUE?                    --> warning or block per strictMode (unchanged)
ANY OTHER STATUS (default)   --> block (NEW: fail-closed)
```

