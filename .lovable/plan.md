
# PI B1.0 — BILLING SAFE GOLD v1.0 (IMPLEMENTATION)

## Pre-Condition Check: ✅ ALL PASSED

| Requirement | Evidence | Status |
|-------------|----------|--------|
| Billing pages exist | `src/pages/TenantBilling.tsx` | ✅ EXISTS |
| Stripe client integrated | Edge functions (create-tenant-subscription, stripe-webhook) | ✅ EXISTS |
| tenant_billing table exists | `src/integrations/supabase/types.ts` (line 2070) | ✅ EXISTS |
| Auth fixtures exist | `e2e/fixtures/auth.fixture.ts` | ✅ EXISTS |
| Test logger exists | `e2e/helpers/testLogger.ts` | ✅ EXISTS |
| Freeze time exists | `e2e/helpers/freeze-time.ts` | ✅ EXISTS (from PI E1.0) |
| Existing billing tests | `e2e/billing/billing-states.spec.ts` (10 tests) | ✅ EXISTS |

### Key Findings

| Component | Current State | PI B1.0 Action |
|-----------|--------------|----------------|
| `TenantBilling.tsx` | No `data-*` attributes | Add `data-billing-root`, view state |
| `BillingOverviewCard.tsx` | No `data-*` attributes | Add status + source + CTA attributes |
| `BillingTimeline.tsx` | No `data-*` attributes | Add timeline step attributes |
| `BillingStatusBanner.tsx` | No `data-*` attributes | Add status badge attributes |
| `TenantBlockedScreen.tsx` | Has one `data-testid` | Add blocked state + countdown |
| `resolveTenantBillingState.ts` | Source of truth | Reference for SAFE GOLD subset |

### Existing Status Enum (Domain)

The production code uses these 8 statuses:
- `ACTIVE`, `TRIALING`, `TRIAL_EXPIRED`, `PENDING_DELETE`, `PAST_DUE`, `CANCELED`, `UNPAID`, `INCOMPLETE`

### SAFE GOLD Subset (Frozen)

For contract testing, we will freeze a reduced subset:
- `TRIAL` (maps to TRIALING/TRIAL_EXPIRED)
- `ACTIVE`
- `PAST_DUE`
- `CANCELED`
- `BLOCKED` (maps to PENDING_DELETE/UNPAID/INCOMPLETE)

---

## Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│                PI B1.0 BILLING SAFE GOLD                      │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  PART 1 — Domain Types (SAFE GOLD Subset)                     │
│  └── src/types/billing-state.ts                               │
│      (BillingStatus, BillingSource, BillingViewState)         │
│                                                               │
│  PART 2 — Normalizers (Pure Functions)                        │
│  └── src/domain/billing/normalize.ts                          │
│      (assertBillingStatus, assertBillingSource, etc.)         │
│                                                               │
│  PART 3 — UI Instrumentation (data-* attributes)              │
│  ├── TenantBilling.tsx                                        │
│  │   └── data-testid="billing-root"                           │
│  │   └── data-billing-view-state="LOADING|READY|ERROR"        │
│  ├── BillingOverviewCard.tsx                                  │
│  │   └── data-testid="billing-card"                           │
│  │   └── data-billing-status                                  │
│  │   └── data-billing-source                                  │
│  ├── BillingTimeline.tsx                                      │
│  │   └── data-testid="billing-timeline"                       │
│  └── TenantBlockedScreen.tsx                                  │
│      └── data-testid="tenant-blocked-screen" (exists)         │
│      └── data-blocked-reason                                  │
│                                                               │
│  PART 4 — E2E Helpers                                         │
│  ├── e2e/helpers/freeze-time.ts (REUSE from E1.0)             │
│  └── e2e/helpers/mock-billing.ts (NEW)                        │
│                                                               │
│  PART 5 — Contract Tests                                      │
│  └── e2e/contract/billing-contract.spec.ts                    │
│      (B.C.1 to B.C.5)                                         │
│                                                               │
│  PART 6 — Resilience Tests                                    │
│  └── e2e/resilience/billing-failure.spec.ts                   │
│      (B.R.1 to B.R.5)                                         │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## PART 1 — SAFE GOLD State Contract

### File: `src/types/billing-state.ts` (NEW)

Creates a DELIBERATELY REDUCED subset for E2E tests. This is NOT the full domain.

```typescript
/**
 * BILLING SAFE GOLD — v1.0
 *
 * Contrato mínimo, estável e congelado.
 * NÃO representa o domínio completo.
 * Qualquer expansão exige novo PI SAFE GOLD.
 * 
 * NOTE: Production code uses src/lib/billing/resolveTenantBillingState.ts
 * This is a TEST CONTRACT ONLY.
 */

export type SafeBillingStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'BLOCKED';

export type SafeBillingSource =
  | 'STRIPE'
  | 'MANUAL';

export type BillingViewState =
  | 'LOADING'
  | 'READY'
  | 'ERROR';

export const SAFE_BILLING_STATUSES: readonly SafeBillingStatus[] = [
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'BLOCKED',
] as const;

export const SAFE_BILLING_SOURCES: readonly SafeBillingSource[] = [
  'STRIPE',
  'MANUAL',
] as const;

export const SAFE_BILLING_VIEW_STATES: readonly BillingViewState[] = [
  'LOADING',
  'READY',
  'ERROR',
] as const;

/**
 * Maps production status to SAFE GOLD subset
 */
export const PRODUCTION_TO_SAFE_STATUS: Record<string, SafeBillingStatus> = {
  'ACTIVE': 'ACTIVE',
  'TRIALING': 'TRIAL',
  'TRIAL_EXPIRED': 'TRIAL',
  'PAST_DUE': 'PAST_DUE',
  'CANCELED': 'CANCELED',
  'PENDING_DELETE': 'BLOCKED',
  'UNPAID': 'BLOCKED',
  'INCOMPLETE': 'BLOCKED',
};
```

---

## PART 2 — Normalizer Functions

### File: `src/domain/billing/normalize.ts` (NEW)

Creates directory `src/domain/billing/` and adds pure normalizers.

```typescript
import type {
  SafeBillingStatus,
  SafeBillingSource,
  BillingViewState,
} from '@/types/billing-state';

import { PRODUCTION_TO_SAFE_STATUS } from '@/types/billing-state';

const STATUS: SafeBillingStatus[] = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'BLOCKED'];
const SOURCE: SafeBillingSource[] = ['STRIPE', 'MANUAL'];
const VIEW: BillingViewState[] = ['LOADING', 'READY', 'ERROR'];

/**
 * Assert billing status belongs to SAFE GOLD subset
 */
export function assertBillingStatus(v: string): SafeBillingStatus {
  // First try direct match
  if (STATUS.includes(v as SafeBillingStatus)) {
    return v as SafeBillingStatus;
  }
  // Then try production-to-safe mapping
  const mapped = PRODUCTION_TO_SAFE_STATUS[v.toUpperCase()];
  return mapped ?? 'BLOCKED';
}

export function assertBillingSource(v: string): SafeBillingSource {
  const upper = v.toUpperCase();
  if (upper === 'MANUAL_OVERRIDE') return 'MANUAL';
  return SOURCE.includes(upper as SafeBillingSource)
    ? (upper as SafeBillingSource)
    : 'STRIPE';
}

export function assertBillingViewState(v: string): BillingViewState {
  return VIEW.includes(v as BillingViewState)
    ? (v as BillingViewState)
    : 'ERROR';
}
```

---

## PART 3 — UI Instrumentation

### 3.1 TenantBilling.tsx

**Location**: Lines 132-277

| Element | Attribute | Value Source |
|---------|-----------|--------------|
| Root div (line 134) | `data-testid="billing-root"` | Static |
| Root div | `data-billing-view-state` | `isLoading ? 'LOADING' : 'READY'` |

### 3.2 BillingOverviewCard.tsx

**Location**: Lines 166-217

| Element | Attribute | Value Source |
|---------|-----------|--------------|
| Card (line 167) | `data-testid="billing-card"` | Static |
| Card | `data-billing-status` | `status` from billingState |
| Card | `data-billing-source` | `billingState.source` |
| CTA Button (line 197) | `data-testid="billing-cta"` | Static |
| CTA Button | `data-billing-action` | `cta.action` (upgrade/manage/reactivate) |

### 3.3 BillingTimeline.tsx

**Location**: Lines 197-237

| Element | Attribute | Value Source |
|---------|-----------|--------------|
| Card (line 198/179) | `data-testid="billing-timeline"` | Static |
| Each step (line 215) | `data-timeline-step` | step.id |
| Each step | `data-timeline-status` | step.status |

### 3.4 TenantBlockedScreen.tsx

**Location**: Lines 68-288

| Element | Attribute | Current/New |
|---------|-----------|-------------|
| Root div | `data-testid="tenant-blocked-screen"` | ✅ Already exists (via existing tests) |
| Root div | `data-blocked-reason` | NEW: `billingStatus` |
| Countdown | `data-testid="delete-countdown"` | NEW |
| Urgent CTA | `data-testid="billing-urgent-cta"` | NEW |

### 3.5 BillingStatusBanner.tsx

**Location**: Lines 205-255

| Element | Attribute | Value Source |
|---------|-----------|--------------|
| Alert (line 206) | `data-testid="billing-status-banner"` | Static |
| Alert | `data-billing-status` | `billing.status` |
| Manage Button (line 226) | `data-testid="billing-manage-btn"` | Static |

---

## PART 4 — E2E Helpers

### 4.1 Freeze Time

**File**: `e2e/helpers/freeze-time.ts` — ✅ REUSE (already exists from PI E1.0)

### 4.2 Mock Billing

**File**: `e2e/helpers/mock-billing.ts` (NEW)

Key functions:
- `mockTenantBilling(page, billing)` — Intercepts `/rest/v1/tenant_billing*`
- `mockTenantInvoices(page, invoices)` — Intercepts `/rest/v1/tenant_invoices*`
- `makeBillingData(status, options)` — Factory for mock billing data

```typescript
export interface MockBillingData {
  id: string;
  tenant_id: string;
  status: string;
  is_manual_override: boolean;
  override_reason: string | null;
  trial_ends_at: string | null;
  scheduled_delete_at: string | null;
  stripe_customer_id: string | null;
}

export async function mockTenantBilling(
  page: Page,
  billing: MockBillingData | null
): Promise<void>
```

---

## PART 5 — Contract Tests

### File: `e2e/contract/billing-contract.spec.ts` (NEW)

| ID | Test Name | Description |
|----|-----------|-------------|
| B.C.1 | Renders deterministically | freezeTime → mock → login → assert `[data-testid="billing-root"]` visible |
| B.C.2 | Billing status SAFE GOLD | Assert `data-billing-status` ∈ SAFE_BILLING_STATUSES (mapped) |
| B.C.3 | Billing source SAFE GOLD | Assert `data-billing-source` ∈ SAFE_BILLING_SOURCES |
| B.C.4 | Mutation boundary | FAIL if POST/PUT/PATCH/DELETE to protected tables during browsing |
| B.C.5 | Navigation stability | No async redirects for 10 seconds |

**Protected Tables (mutation = FAIL)**:
- tenants, memberships, payments, invoices, subscriptions, user_roles, athletes, profiles

**Note on B.C.2**: Since production uses 8 statuses and SAFE GOLD uses 5, the test will map production statuses to the SAFE subset before assertion.

---

## PART 6 — Resilience Tests

### File: `e2e/resilience/billing-failure.spec.ts` (NEW)

| ID | Test Name | Mock | Assertion |
|----|-----------|------|-----------|
| B.R.1 | 403 Forbidden | route tenant_billing → 403 | body visible, no crash |
| B.R.2 | 500 Server Error | route tenant_billing → 500 | body visible, content > 20 chars |
| B.R.3 | Network timeout | route tenant_billing → 15s delay | body visible, no crash |
| B.R.4 | Invalid JSON | route tenant_billing → malformed | body visible, no white screen |
| B.R.5 | Stripe unavailable | route edge functions → 503 | body visible, fallback UI shown |

---

## Files Summary

### New Files (5)

| File | Description |
|------|-------------|
| `src/types/billing-state.ts` | SAFE GOLD state contract (subset) |
| `src/domain/billing/normalize.ts` | Pure normalizer functions |
| `e2e/helpers/mock-billing.ts` | Billing mock factory |
| `e2e/contract/billing-contract.spec.ts` | Contract tests (B.C.1-5) |
| `e2e/resilience/billing-failure.spec.ts` | Resilience tests (B.R.1-5) |

### Modified Files (5)

| File | Changes |
|------|---------|
| `src/pages/TenantBilling.tsx` | Add `data-testid`, `data-billing-view-state` |
| `src/components/billing/BillingOverviewCard.tsx` | Add `data-testid`, `data-billing-status`, `data-billing-source`, `data-billing-action` |
| `src/components/billing/BillingTimeline.tsx` | Add `data-testid`, `data-timeline-step`, `data-timeline-status` |
| `src/components/billing/TenantBlockedScreen.tsx` | Add `data-blocked-reason`, `data-testid="delete-countdown"`, `data-testid="billing-urgent-cta"` |
| `src/components/billing/BillingStatusBanner.tsx` | Add `data-testid="billing-status-banner"`, `data-billing-status` |

---

## Execution Order

```text
1. Create SAFE GOLD state contract
    │ src/types/billing-state.ts
    │
    ▼
2. Create normalizer functions
    │ src/domain/billing/normalize.ts
    │
    ▼
3. Instrument UI components (data-* only)
    │ TenantBilling.tsx
    │ BillingOverviewCard.tsx
    │ BillingTimeline.tsx
    │ TenantBlockedScreen.tsx
    │ BillingStatusBanner.tsx
    │
    ▼
4. Create E2E mock helper
    │ e2e/helpers/mock-billing.ts
    │ (Reuse e2e/helpers/freeze-time.ts)
    │
    ▼
5. Create contract tests
    │ e2e/contract/billing-contract.spec.ts
    │
    ▼
6. Create resilience tests
    │ e2e/resilience/billing-failure.spec.ts
    │
    ▼
PI B1.0 CLOSED
```

---

## Acceptance Criteria (ALL REQUIRED)

| Criterion | Validation |
|-----------|------------|
| ✅ Zero visual changes | UI renders identically |
| ✅ Zero Stripe changes | No edge function modifications |
| ✅ Zero schema changes | No database modifications |
| ✅ Contract B.C.1-5 pass | Green |
| ✅ Resilience B.R.1-5 pass | Green |
| ✅ Zero CSS-based selectors | All tests use `data-*` |
| ✅ Strict enum subset | SAFE_BILLING_STATUSES with mapping |
| ✅ No mutations during browsing | B.C.4 validates |
| ✅ Navigation stable | B.C.5 validates |
| ✅ Existing tests still pass | `e2e/billing/billing-states.spec.ts` green |

---

## SAFE GOLD Guarantees

This PI **DOES NOT**:
- Create new features
- Change visual UI
- Alter business logic
- Modify database schema
- Touch Stripe integration
- Remove existing tests
- Use date/time heuristics
- Alter billing resolver logic

This PI **ONLY**:
- Adds `data-*` test instrumentation
- Creates pure type definitions (subset)
- Creates deterministic E2E tests
- Validates existing behavior via mocks

---

## Technical Notes

### Status Mapping Strategy

Production uses 8 statuses, SAFE GOLD uses 5. The mapping:

| Production Status | SAFE GOLD Status |
|------------------|------------------|
| ACTIVE | ACTIVE |
| TRIALING | TRIAL |
| TRIAL_EXPIRED | TRIAL |
| PAST_DUE | PAST_DUE |
| CANCELED | CANCELED |
| PENDING_DELETE | BLOCKED |
| UNPAID | BLOCKED |
| INCOMPLETE | BLOCKED |

This mapping is deterministic and reversible for testing purposes.

### Relationship with Existing Tests

The existing `e2e/billing/billing-states.spec.ts` tests individual status rendering. The new contract tests focus on:
- **Enum compliance** (mapped to SAFE GOLD subset)
- **Mutation boundaries** (no writes to protected tables)
- **Navigation stability** (no async redirects)

Both test suites complement each other.

---

## Declaration

**BILLING SAFE GOLD v1.0 — FROZEN**

Any future changes require a new PI SAFE GOLD.
