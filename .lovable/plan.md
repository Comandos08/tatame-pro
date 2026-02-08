

# PI E1.0 — EVENTS SAFE GOLD v1.0 (IMPLEMENTATION)

## Pre-Condition Check: ✅ PASSED

The Events module exists with all required components:
- `src/pages/EventsList.tsx` ✅
- `src/pages/EventDetails.tsx` ✅
- `src/pages/PublicEventDetails.tsx` ✅
- `src/components/events/EventCard.tsx` ✅
- `src/components/events/EventStatusBadge.tsx` ✅
- `src/components/events/RegistrationStatusBadge.tsx` ✅
- `src/components/events/EventRegistrationButton.tsx` ✅
- `e2e/fixtures/auth.fixture.ts` ✅
- `e2e/helpers/testLogger.ts` ✅

---

## PART 1 — SAFE GOLD State Contract

### File: `src/types/events-state.ts` (NEW)

Creates a deliberately reduced SUBSET for E2E tests. This is NOT the full domain - it is a stability contract.

```typescript
/**
 * EVENTS SAFE GOLD — v1.0
 *
 * Este arquivo define o CONTRATO MÍNIMO e ESTÁVEL
 * usado por testes E2E e instrumentação de UI.
 *
 * ⚠️ IMPORTANTE:
 * - Este NÃO é o domínio completo.
 * - É um SUBSET deliberadamente reduzido.
 * - Nenhum novo estado pode ser adicionado aqui sem novo PI SAFE GOLD.
 */

export type EventState =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'ONGOING'
  | 'FINISHED'
  | 'CANCELED';

export type RegistrationState =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELED';

export type ConnectionPolicy =
  | 'REALTIME'
  | 'POLLING'
  | 'OFFLINE';

export const SAFE_EVENT_STATES: readonly EventState[] = [
  'DRAFT',
  'PUBLISHED',
  'ONGOING',
  'FINISHED',
  'CANCELED',
] as const;

export const SAFE_REGISTRATION_STATES: readonly RegistrationState[] = [
  'PENDING',
  'CONFIRMED',
  'CANCELED',
] as const;
```

---

## PART 2 — Normalizer Functions

### File: `src/domain/events/normalize.ts` (NEW)

Creates directory `src/domain/events/` and adds pure normalizers.

```typescript
import type { EventState, RegistrationState } from '@/types/events-state';

const EVENT_STATES: EventState[] = [
  'DRAFT', 'PUBLISHED', 'ONGOING', 'FINISHED', 'CANCELED',
];

const REGISTRATION_STATES: RegistrationState[] = [
  'PENDING', 'CONFIRMED', 'CANCELED',
];

export function assertEventState(v: string): EventState {
  return EVENT_STATES.includes(v as EventState)
    ? (v as EventState)
    : 'DRAFT';
}

export function assertRegistrationState(v: string): RegistrationState {
  return REGISTRATION_STATES.includes(v as RegistrationState)
    ? (v as RegistrationState)
    : 'PENDING';
}
```

---

## PART 3 — UI Instrumentation

### 3.1 EventsList.tsx

| Line | Change |
|------|--------|
| 177 | Add `data-testid="events-list"` to grid div |
| 159 | Add `data-testid="events-empty-state"` to empty Card |

### 3.2 EventCard.tsx

| Line | Change |
|------|--------|
| 45 | Add `data-event-id={event.id}` and `data-event-state={event.status}` to Card |
| 105-106 | Add `data-testid="event-open"` to Button/Link |

### 3.3 EventStatusBadge.tsx

| Line | Change |
|------|--------|
| 39 | Add `data-testid="event-state-badge"` and `data-event-state={status}` to Badge |

### 3.4 RegistrationStatusBadge.tsx

| Line | Change |
|------|--------|
| 59-66 | Add `data-testid="registration-state-badge"` and `data-registration-state={status}` to unknown status Badge |
| 78-89 | Add same attributes to main Badge element |

### 3.5 EventDetails.tsx

| Line | Change |
|------|--------|
| 182 | Add `data-testid="event-detail"` to motion.div |
| 196 | Add `data-testid="event-title"` to h1 |

### 3.6 EventRegistrationButton.tsx

| Line | Change |
|------|--------|
| 216 | Add `data-testid="event-cancel-registration-button"` to cancel Button |
| 294 | Add `data-testid="event-register-button"` to register Button |
| 157 | Add `data-testid="event-login-to-register"` to login Button |

---

## PART 4 — E2E Helpers

### File: `e2e/helpers/freeze-time.ts` (NEW)

```typescript
import { Page } from '@playwright/test';

export async function freezeTime(
  page: Page,
  iso: string = '2026-02-07T12:00:00.000Z'
): Promise<void> {
  await page.addInitScript((timestamp) => {
    const frozenNow = new Date(timestamp).getTime();
    Date.now = () => frozenNow;
    const OriginalDate = Date;
    // @ts-ignore
    window.Date = class extends OriginalDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(frozenNow);
        } else {
          // @ts-ignore
          super(...args);
        }
      }
      static now() {
        return frozenNow;
      }
    };
  }, iso);
}
```

### File: `e2e/helpers/mock-events.ts` (NEW)

Creates factory for mocking events endpoints. Key features:
- All mocks return SAFE GOLD states only
- Maps extended states (REGISTRATION_OPEN, ARCHIVED) to SAFE subset
- Provides `mockEventsList`, `mockEventDetail`, `mockRegistrations`
- Provides `createMockEvent` factory

---

## PART 5 — Contract Tests

### File: `e2e/contract/events-contract.spec.ts` (NEW)

**Required Tests:**

| ID | Name | Description |
|----|------|-------------|
| E.C.1 | List renders deterministically | freezeTime → mock → login → assert `[data-testid="events-list"]` visible |
| E.C.2 | Event state enum compliance | Assert all `[data-event-state]` values ∈ SAFE_EVENT_STATES |
| E.C.3 | Multi-tenant isolation | Mock tenant A events, verify tenant B events not visible |
| E.C.4 | Mutation boundary enforcement | Intercept REST, FAIL if POST/PUT/DELETE to protected tables |
| E.C.5 | Navigation stability | Record `framenavigated`, wait 10s, assert URL unchanged |

**Protected Tables (mutation = FAIL):**
- athletes, profiles, academies, tenants, memberships, digital_cards, user_roles

**Allowed Mutations:**
- events, event_registrations, event_categories

---

## PART 6 — Resilience Tests

### File: `e2e/resilience/events-failure.spec.ts` (NEW)

**Required Tests:**

| ID | Name | Mock | Assertion |
|----|------|------|-----------|
| E.R.1 | 403 Forbidden | route → 403 | body visible, no error boundary |
| E.R.2 | 500 Server Error | route → 500 | body visible, content > 50 chars |
| E.R.3 | Network timeout | route → 15s delay | body visible, no crash |
| E.R.4 | Invalid JSON | route → malformed body | body visible, no white screen |
| E.R.5 | Mixed failures | events 503, categories 200 | body visible, navigable |

---

## Files Summary

### New Files (7)

| File | Description |
|------|-------------|
| `src/types/events-state.ts` | SAFE GOLD state contract (subset) |
| `src/domain/events/normalize.ts` | Pure normalizer functions |
| `e2e/helpers/freeze-time.ts` | Time control for deterministic tests |
| `e2e/helpers/mock-events.ts` | Events mock factory |
| `e2e/contract/events-contract.spec.ts` | Contract tests (E.C.1-5) |
| `e2e/resilience/events-failure.spec.ts` | Resilience tests (E.R.1-5) |
| `e2e/behavior/README.md` | Policy documentation placeholder |

### Modified Files (7)

| File | Changes |
|------|---------|
| `src/pages/EventsList.tsx` | Add `data-testid` (lines 159, 177) |
| `src/pages/EventDetails.tsx` | Add `data-testid` (lines 182, 196) |
| `src/components/events/EventCard.tsx` | Add `data-event-id`, `data-event-state`, `data-testid` |
| `src/components/events/EventStatusBadge.tsx` | Add `data-testid`, `data-event-state` |
| `src/components/events/RegistrationStatusBadge.tsx` | Add `data-testid`, `data-registration-state` |
| `src/components/events/EventRegistrationButton.tsx` | Add `data-testid` to buttons |

---

## Execution Order

```text
1. Create SAFE GOLD state contract
    │ src/types/events-state.ts
    │
    ▼
2. Create normalizer functions
    │ src/domain/events/normalize.ts
    │
    ▼
3. Instrument UI components (data-* only)
    │ EventsList.tsx
    │ EventCard.tsx
    │ EventDetails.tsx
    │ EventStatusBadge.tsx
    │ RegistrationStatusBadge.tsx
    │ EventRegistrationButton.tsx
    │
    ▼
4. Create E2E helpers
    │ e2e/helpers/freeze-time.ts
    │ e2e/helpers/mock-events.ts
    │
    ▼
5. Create contract tests
    │ e2e/contract/events-contract.spec.ts
    │
    ▼
6. Create resilience tests
    │ e2e/resilience/events-failure.spec.ts
    │
    ▼
PI E1.0 CLOSED
```

---

## SAFE GOLD Guarantees

This PI **DOES NOT**:
- Create new features
- Change visual UI
- Alter business logic
- Modify database schema
- Remove existing tests
- Use date/time heuristics
- Re-export or alias EventStatus from src/types/event.ts
- Add states beyond the SAFE GOLD subset

This PI **ONLY**:
- Adds `data-*` test instrumentation
- Creates pure type definitions (subset)
- Creates deterministic E2E tests
- Validates existing behavior via mocks

