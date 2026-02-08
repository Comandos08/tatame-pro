# ANALYTICS2.0 — AGGREGATIONS & DERIVED METRICS (SAFE GOLD)

## Status

🧊 **FROZEN** — SAFE GOLD v2.0

---

## Objective

Seal the Analytics / Derived Metrics layer to ensure:

- ❌ NO mutations during analytics
- ❌ NO implicit time dependencies
- ❌ NO side effects or jobs
- ❌ NO timezone dependencies
- ❌ NO cache dependencies
- ✅ 100% deterministic output
- ✅ READ-ONLY pure operations
- ✅ Reproducible results (same input → same output)
- ✅ Graceful degradation on failures

---

## SAFE GOLD Enums

### Analytics Metrics

```typescript
export const SAFE_ANALYTICS_METRICS = [
  'TOTAL_ATHLETES',
  'ACTIVE_MEMBERSHIPS',
  'EXPIRED_MEMBERSHIPS',
  'REVENUE_TOTAL',
  'REVENUE_MRR',
  'EVENTS_COUNT',
  'EVENTS_ACTIVE',
] as const;
```

### Analytics View States

```typescript
export const SAFE_ANALYTICS_VIEW_STATES = [
  'OK',      // Data loaded successfully
  'EMPTY',   // No data available (not an error)
  'PARTIAL', // Incomplete data (degraded mode)
  'ERROR',   // Failed to load
] as const;
```

---

## Mutation Boundary

### Protected Tables (NO mutations during analytics)

```typescript
export const ANALYTICS_PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'athletes',
  'memberships',
  'events',
  'event_brackets',
  'tenant_billing',
  'tenant_invoices',
] as const;
```

**Rule**: Any `POST`, `PUT`, `PATCH`, or `DELETE` to these tables during analytics operations FAILS the contract test.

---

## Normalizers (Pure Functions)

### `normalizeAnalyticsViewState(input)`

Maps raw API response to deterministic view state:

| Input | Output |
|-------|--------|
| `null` / `undefined` | `'EMPTY'` |
| `[]` (empty array) | `'EMPTY'` |
| Non-empty array | `'OK'` |
| Object with `error` | `'ERROR'` |
| Object with `partial` | `'PARTIAL'` |
| Empty object `{}` | `'EMPTY'` |
| Non-empty object | `'OK'` |

### Pure Aggregation Functions

```typescript
// Count items
aggregateCount(items: readonly unknown[]): number

// Sum values
aggregateSum(values: readonly number[]): number

// Average values
aggregateAverage(values: readonly number[]): number

// Min/Max
aggregateMin(values: readonly number[]): number
aggregateMax(values: readonly number[]): number

// Group by key
groupBy<T>(items: readonly T[], keyFn: (item: T) => string): Record<string, T[]>
```

---

## Determinism Rules

### Prohibited

- ❌ `Date.now()`
- ❌ `new Date()` (except ISO literals)
- ❌ `Math.random()`
- ❌ Dynamic UUIDs
- ❌ Timezone-dependent calculations
- ❌ Cache-dependent results
- ❌ Side effects
- ❌ Background jobs

### Required

- ✅ `generated_at: FIXED_TIMESTAMP_ISO`
- ✅ All metrics from SAFE_ANALYTICS_METRICS
- ✅ All aggregations via pure functions
- ✅ Deterministic ordering

---

## DOM Instrumentation

### AppShell Attributes

```html
data-analytics-view-state="OK|EMPTY|PARTIAL|ERROR"
data-analytics-metrics="TOTAL_ATHLETES,ACTIVE_MEMBERSHIPS,..."
data-analytics-route="/tenant/app/analytics/..."
```

---

## Contract Tests (AN.C.*)

| ID | Description | Status |
|----|-------------|--------|
| AN.C.1 | Renders deterministically | ✅ |
| AN.C.2 | Metrics ∈ SAFE_ANALYTICS_METRICS | ✅ |
| AN.C.3 | ViewState ∈ SAFE_ANALYTICS_VIEW_STATES | ✅ |
| AN.C.4 | NO mutations to protected tables | ✅ |
| AN.C.5 | Navigation stable for 10s | ✅ |
| AN.C.6 | Idempotent re-execution | ✅ |
| AN.C.7 | Empty data ≠ crash | ✅ |
| AN.C.8 | Partial data ≠ broken UI | ✅ |

---

## Resilience Tests (AN.R.*)

| ID | Description | Status |
|----|-------------|--------|
| AN.R.1 | 403 → UI stays visible | ✅ |
| AN.R.2 | 500 → UI stays visible | ✅ |
| AN.R.3 | Timeout → UI stays visible | ✅ |
| AN.R.4 | Invalid JSON → UI stays visible | ✅ |
| AN.R.5 | Partial data ≠ crash | ✅ |
| AN.R.6 | Loop detection (ratio < 0.5/s) | ✅ |
| AN.R.7 | Recovery post-failure | ✅ |
| AN.R.8 | No unexpected redirects | ✅ |

---

## Mock Data (Deterministic)

### Fixed Analytics Payload

```json
{
  "generated_at": "2026-02-07T12:00:00.000Z",
  "tenant_id": "tenant_analytics_01",
  "metrics": {
    "TOTAL_ATHLETES": 150,
    "ACTIVE_MEMBERSHIPS": 120,
    "EXPIRED_MEMBERSHIPS": 30,
    "REVENUE_TOTAL": 4500000,
    "REVENUE_MRR": 375000,
    "EVENTS_COUNT": 12,
    "EVENTS_ACTIVE": 3
  }
}
```

---

## Files

### Created (ANALYTICS2.0)

- `src/types/analytics-state.ts`
- `src/domain/analytics/protected.ts`
- `src/domain/analytics/normalize.ts`
- `e2e/helpers/mock-analytics.ts`
- `e2e/contract/analytics.spec.ts`
- `e2e/resilience/analytics.spec.ts`
- `docs/SAFE_GOLD/ANALYTICS2.0-analytics.md` (this file)

### Modified (ANALYTICS2.0)

- `src/layouts/AppShell.tsx` (DOM instrumentation)

---

## Guarantees

1. **Zero Mutations**: Analytics are 100% read-only
2. **Zero Side Effects**: No writes, jobs, or external calls
3. **Zero Time Dependencies**: All timestamps are external
4. **Zero Crashes**: Empty/partial/error data handled gracefully
5. **Zero Loops**: Navigation ratio < 0.5/s enforced
6. **Reproducible**: Same input → same output

---

## Status

```
ANALYTICS2.0 — SAFE GOLD v2.0
🔒 READ-ONLY
🧪 CONTRACTUAL
🔄 REPRODUCIBLE
🚫 ZERO SIDE EFFECT
🧠 GOVERNADO
```

**This document is FROZEN. Any changes require a new PI.**
