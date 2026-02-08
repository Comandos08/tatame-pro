
# PI A1.0 — ATHLETE PORTAL SAFE GOLD v1.0 (IMPLEMENTATION)

## Pre-Condition Check: ✅ PASSED

| Requirement | File | Status |
|-------------|------|--------|
| Portal Page | `src/pages/AthletePortal.tsx` | ✅ EXISTS |
| Portal Events | `src/pages/PortalEvents.tsx` | ✅ EXISTS |
| Portal Components | `src/components/portal/*` | ✅ EXISTS |
| Auth Fixtures | `e2e/fixtures/auth.fixture.ts` | ✅ EXISTS |
| Test Logger | `e2e/helpers/testLogger.ts` | ✅ EXISTS |
| Freeze Time | `e2e/helpers/freeze-time.ts` | ✅ EXISTS (from PI E1.0) |

### Key Findings

| Component | Current State | PI A1.0 Action |
|-----------|--------------|----------------|
| `AthletePortal.tsx` | No `data-*` attributes | Add portal view state + membership state |
| `MembershipStatusCard.tsx` | No `data-*` attributes | Add `data-testid` + `data-membership-state` |
| `DigitalCardSection.tsx` | No `data-*` attributes | Add `data-testid` + `data-card-state` |
| `PortalAccessGate.tsx` | Has internal GateState | Leverage for view state instrumentation |
| Auth Fixtures | Has `loginAsApprovedAthlete` | ✅ Ready to use |

---

## Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│                PI A1.0 ATHLETE PORTAL SAFE GOLD               │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  PART 1 — Domain Types (SAFE GOLD Subset)                     │
│  └── src/types/athlete-portal-state.ts                        │
│      (PortalViewState, MembershipState, CardState)            │
│                                                               │
│  PART 2 — Normalizers (Pure Functions)                        │
│  └── src/domain/athlete-portal/normalize.ts                   │
│      (assertPortalViewState, assertMembershipState, etc.)     │
│                                                               │
│  PART 3 — UI Instrumentation (data-* attributes)              │
│  ├── AthletePortal.tsx                                        │
│  │   └── data-testid="athlete-portal"                         │
│  │   └── data-portal-view-state="READY|LOADING|EMPTY|ERROR"   │
│  ├── MembershipStatusCard.tsx                                 │
│  │   └── data-testid="portal-membership-card"                 │
│  │   └── data-membership-state="ACTIVE|EXPIRING|EXPIRED|NONE" │
│  ├── DigitalCardSection.tsx                                   │
│  │   └── data-testid="portal-digital-card"                    │
│  │   └── data-card-state="VALID|INVALID|NONE"                 │
│  ├── MyEventsCard.tsx                                         │
│  │   └── data-testid="portal-events-list"                     │
│  └── PortalEvents.tsx                                         │
│      └── data-testid="portal-events"                          │
│                                                               │
│  PART 4 — E2E Helpers                                         │
│  ├── e2e/helpers/freeze-time.ts (REUSE from E1.0)             │
│  └── e2e/helpers/mock-athlete-portal.ts (NEW)                 │
│                                                               │
│  PART 5 — Contract Tests                                      │
│  └── e2e/contract/athlete-portal-contract.spec.ts             │
│      (A.C.1 to A.C.6)                                         │
│                                                               │
│  PART 6 — Resilience Tests                                    │
│  └── e2e/resilience/athlete-portal-failure.spec.ts            │
│      (A.R.1 to A.R.5)                                         │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## PART 1 — SAFE GOLD State Contract

### File: `src/types/athlete-portal-state.ts` (NEW)

Creates a deliberately reduced SUBSET for E2E tests. This is NOT the full domain.

```typescript
/**
 * ATHLETE PORTAL SAFE GOLD — v1.0
 *
 * Contrato mínimo e estável para instrumentação + E2E.
 * ⚠️ Não é o domínio completo. É um SUBSET congelado.
 * Qualquer expansão exige novo PI SAFE GOLD.
 */

export type PortalViewState =
  | 'LOADING'
  | 'READY'
  | 'EMPTY'
  | 'ERROR';

export type MembershipState =
  | 'ACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'NONE';

export type CardState =
  | 'VALID'
  | 'INVALID'
  | 'NONE';

export const SAFE_PORTAL_VIEW_STATES: readonly PortalViewState[] = [
  'LOADING', 'READY', 'EMPTY', 'ERROR',
] as const;

export const SAFE_MEMBERSHIP_STATES: readonly MembershipState[] = [
  'ACTIVE', 'EXPIRING', 'EXPIRED', 'NONE',
] as const;

export const SAFE_CARD_STATES: readonly CardState[] = [
  'VALID', 'INVALID', 'NONE',
] as const;
```

---

## PART 2 — Normalizer Functions

### File: `src/domain/athlete-portal/normalize.ts` (NEW)

Creates directory `src/domain/athlete-portal/` and adds pure normalizers.

```typescript
import type {
  PortalViewState,
  MembershipState,
  CardState,
} from '@/types/athlete-portal-state';

const VIEW: PortalViewState[] = ['LOADING','READY','EMPTY','ERROR'];
const MEM: MembershipState[] = ['ACTIVE','EXPIRING','EXPIRED','NONE'];
const CARD: CardState[] = ['VALID','INVALID','NONE'];

export function assertPortalViewState(v: string): PortalViewState {
  return VIEW.includes(v as PortalViewState) ? (v as PortalViewState) : 'ERROR';
}

export function assertMembershipState(v: string): MembershipState {
  return MEM.includes(v as MembershipState) ? (v as MembershipState) : 'NONE';
}

export function assertCardState(v: string): CardState {
  return CARD.includes(v as CardState) ? (v as CardState) : 'NONE';
}

/**
 * Derive membership state from data (pure, no Date.now())
 */
export function deriveMembershipState(input: {
  hasMembership: boolean;
  isActive?: boolean;
  isExpiringSoon?: boolean;
  isExpired?: boolean;
}): MembershipState {
  if (!input.hasMembership) return 'NONE';
  if (input.isExpired) return 'EXPIRED';
  if (input.isExpiringSoon) return 'EXPIRING';
  if (input.isActive) return 'ACTIVE';
  return 'NONE';
}

export function deriveCardState(input: {
  hasCard: boolean;
  isValid?: boolean;
}): CardState {
  if (!input.hasCard) return 'NONE';
  return input.isValid ? 'VALID' : 'INVALID';
}
```

---

## PART 3 — UI Instrumentation

### 3.1 AthletePortal.tsx

**Location**: Lines 205-304

Add `data-testid="athlete-portal"` and `data-portal-view-state` to the PortalLayout wrapper. The state is derived from the PortalAccessGate's internal logic.

| Element | Attribute | Value Source |
|---------|-----------|--------------|
| PortalLayout | `data-testid="athlete-portal"` | Static |
| PortalLayout | `data-portal-view-state` | Derived from loading/error/ready state |
| Renew Button | `data-testid="portal-renew-membership"` | Static |

### 3.2 MembershipStatusCard.tsx

**Location**: Lines 70-108

| Element | Attribute | Value Source |
|---------|-----------|--------------|
| Card | `data-testid="portal-membership-card"` | Static |
| Card | `data-membership-state` | Derived from `status` prop |

### 3.3 DigitalCardSection.tsx

**Location**: Lines 48-85

| Element | Attribute | Value Source |
|---------|-----------|--------------|
| Card | `data-testid="portal-digital-card"` | Static |
| Card | `data-card-state` | `VALID` if digitalCard exists, `NONE` for empty state |
| View Full Card Link | `data-testid="portal-open-digital-card"` | Static |

### 3.4 MyEventsCard.tsx

**Location**: Lines 153-250

| Element | Attribute | Value Source |
|---------|-----------|--------------|
| Card | `data-testid="portal-events-list"` | Static |

### 3.5 PortalEvents.tsx

**Location**: Lines 173-393

| Element | Attribute | Value Source |
|---------|-----------|--------------|
| PortalLayout | `data-testid="portal-events"` | Static |

---

## PART 4 — E2E Helpers

### 4.1 Freeze Time

**File**: `e2e/helpers/freeze-time.ts` — ✅ REUSE (already exists from PI E1.0)

### 4.2 Mock Athlete Portal

**File**: `e2e/helpers/mock-athlete-portal.ts` (NEW)

Key functions:
- `mockPortalBase(page, mocks)` — Intercepts `/rest/v1/athletes`, `/rest/v1/memberships`, `/rest/v1/digital_cards`, `/rest/v1/profiles`
- `makeProfile(id, tenantId)` — Factory for mock profile
- `makeAthlete(id, tenantId)` — Factory for mock athlete
- `makeMembership(id, tenantId, athleteId, status, validUntil)` — Factory for mock membership
- `makeDigitalCard(id, tenantId, athleteId, status, url)` — Factory for mock digital card

---

## PART 5 — Contract Tests

### File: `e2e/contract/athlete-portal-contract.spec.ts` (NEW)

**Note**: Uses `loginAsApprovedAthlete` (not `loginAsAthlete`)

| ID | Test Name | Description |
|----|-----------|-------------|
| A.C.1 | Renders deterministically | freezeTime → mock → login → assert `[data-testid="athlete-portal"]` visible |
| A.C.2 | Portal view state SAFE GOLD | Assert `data-portal-view-state` ∈ SAFE_PORTAL_VIEW_STATES |
| A.C.3 | Membership state SAFE GOLD | Assert `data-membership-state` ∈ SAFE_MEMBERSHIP_STATES (when card exists) |
| A.C.4 | Card state SAFE GOLD | Assert `data-card-state` ∈ SAFE_CARD_STATES (when card exists) |
| A.C.5 | Mutation boundary | FAIL if POST/PUT/PATCH/DELETE to protected tables during browsing |
| A.C.6 | Navigation stability | No async redirects for 10 seconds |

**Protected Tables (mutation = FAIL)**:
- profiles, athletes, academies, tenants, memberships, digital_cards, user_roles

---

## PART 6 — Resilience Tests

### File: `e2e/resilience/athlete-portal-failure.spec.ts` (NEW)

| ID | Test Name | Mock | Assertion |
|----|-----------|------|-----------|
| A.R.1 | 403 Forbidden | route profiles/athletes → 403 | body visible, no crash |
| A.R.2 | 500 Server Error | route memberships → 500 | body visible, content > 20 chars |
| A.R.3 | Network timeout | route memberships → 15s delay | body visible, no crash |
| A.R.4 | Invalid JSON | route digital_cards → malformed | body visible, no white screen |
| A.R.5 | Mixed failures | profiles 200, memberships 503 | body visible, content > 10 chars |

---

## Files Summary

### New Files (5)

| File | Description |
|------|-------------|
| `src/types/athlete-portal-state.ts` | SAFE GOLD state contract (subset) |
| `src/domain/athlete-portal/normalize.ts` | Pure normalizer functions |
| `e2e/helpers/mock-athlete-portal.ts` | Portal mock factory |
| `e2e/contract/athlete-portal-contract.spec.ts` | Contract tests (A.C.1-6) |
| `e2e/resilience/athlete-portal-failure.spec.ts` | Resilience tests (A.R.1-5) |

### Modified Files (5)

| File | Changes |
|------|---------|
| `src/pages/AthletePortal.tsx` | Add `data-testid`, `data-portal-view-state`, `data-testid="portal-renew-membership"` |
| `src/components/portal/MembershipStatusCard.tsx` | Add `data-testid`, `data-membership-state` |
| `src/components/portal/DigitalCardSection.tsx` | Add `data-testid`, `data-card-state` |
| `src/components/portal/MyEventsCard.tsx` | Add `data-testid="portal-events-list"` |
| `src/pages/PortalEvents.tsx` | Add `data-testid="portal-events"` |

---

## Execution Order

```text
1. Create SAFE GOLD state contract
    │ src/types/athlete-portal-state.ts
    │
    ▼
2. Create normalizer functions
    │ src/domain/athlete-portal/normalize.ts
    │
    ▼
3. Instrument UI components (data-* only)
    │ AthletePortal.tsx
    │ MembershipStatusCard.tsx
    │ DigitalCardSection.tsx
    │ MyEventsCard.tsx
    │ PortalEvents.tsx
    │
    ▼
4. Create E2E mock helper
    │ e2e/helpers/mock-athlete-portal.ts
    │ (Reuse e2e/helpers/freeze-time.ts)
    │
    ▼
5. Create contract tests
    │ e2e/contract/athlete-portal-contract.spec.ts
    │
    ▼
6. Create resilience tests
    │ e2e/resilience/athlete-portal-failure.spec.ts
    │
    ▼
PI A1.0 CLOSED
```

---

## Acceptance Criteria (ALL REQUIRED)

| Criterion | Validation |
|-----------|------------|
| ✅ No visual/behavioral changes | UI functions identically |
| ✅ No existing tests break | All current E2E pass |
| ✅ Contract A.C.1-6 pass | Green |
| ✅ Resilience A.R.1-5 pass | Green |
| ✅ Zero CSS-based selectors | All tests use `data-*` |
| ✅ Strict enum subset | SAFE_PORTAL_VIEW_STATES, SAFE_MEMBERSHIP_STATES, SAFE_CARD_STATES |
| ✅ No mutations during browsing | A.C.5 validates |
| ✅ Navigation stable | A.C.6 validates |

---

## SAFE GOLD Guarantees

This PI **DOES NOT**:
- Create new features
- Change visual UI
- Alter business logic
- Modify database schema
- Remove existing tests
- Use date/time heuristics
- Add states beyond the SAFE GOLD subset

This PI **ONLY**:
- Adds `data-*` test instrumentation
- Creates pure type definitions (subset)
- Creates deterministic E2E tests
- Validates existing behavior via mocks
