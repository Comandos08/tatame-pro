# REPORTS1.0 — REPORTS READ MODEL + CONTRACTS (SAFE GOLD)

## Status

🧊 **FROZEN** — SAFE GOLD v1.0

---

## Objective

Establish the SAFE GOLD foundation for the REPORTS domain (operational and executive reports), ensuring:

- ✅ Closed types and enums (SAFE subset)
- ✅ Pure normalization (view state + type)
- ✅ Read-only read model (no side effects)
- ✅ Explicit boundaries (protecting tables and preventing mutations)
- ✅ DOM instrumentation in AppShell
- ✅ E2E Contract + Resilience with deterministic mocks
- ✅ Frozen documentation

---

## SAFE GOLD Enums

### Report Types

```typescript
export const SAFE_REPORT_TYPES = [
  'TENANT_OVERVIEW',
  'MEMBERSHIPS_HEALTH',
  'EVENTS_SUMMARY',
  'BILLING_STATUS',
  'AUDIT_TRAIL',
] as const;

export type SafeReportType = (typeof SAFE_REPORT_TYPES)[number];
```

### Report View States

```typescript
export const SAFE_REPORT_VIEW_STATES = [
  'OK',
  'EMPTY',
  'PARTIAL',
  'ERROR',
  'LOADING',
] as const;

export type SafeReportViewState = (typeof SAFE_REPORT_VIEW_STATES)[number];
```

### Production → SAFE Mapping

```typescript
export const PRODUCTION_TO_SAFE_REPORT_TYPE: Record<string, SafeReportType> = {
  'TENANT': 'TENANT_OVERVIEW',
  'OVERVIEW': 'TENANT_OVERVIEW',
  'MEMBERSHIPS': 'MEMBERSHIPS_HEALTH',
  'EVENTS': 'EVENTS_SUMMARY',
  'BILLING': 'BILLING_STATUS',
  'AUDIT': 'AUDIT_TRAIL',
  // ... additional mappings
};
```

---

## Protected Tables (Mutation Boundary)

```typescript
export const REPORTS_PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'athletes',
  'memberships',
  'events',
  'event_brackets',
  'tenant_billing',
  'tenant_invoices',
  'audit_logs',
  'diplomas',
  'coaches',
  'academies',
] as const;
```

**Rule**: Any `POST`, `PUT`, `PATCH`, or `DELETE` to these tables during `/reports/*` navigation FAILS the contract test.

---

## Normalizers (Pure Functions)

### `normalizeReportsViewState(input)`

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

### `assertReportType(v)`

```typescript
// Falls back to 'TENANT_OVERVIEW' for unknown values
assertReportType('BILLING') // → 'BILLING_STATUS'
assertReportType('unknown') // → 'TENANT_OVERVIEW'
```

### `isReportsRoute(pathname)`

```typescript
// Pure route detection
isReportsRoute('/tenant/app/reports') // → true
isReportsRoute('/tenant/app/athletes') // → false
```

### `deriveActiveReportType(pathname)`

```typescript
// Route-based extraction
deriveActiveReportType('/reports/memberships') // → 'MEMBERSHIPS_HEALTH'
deriveActiveReportType('/reports/billing') // → 'BILLING_STATUS'
```

---

## DOM Instrumentation

### AppShell Attributes

```html
data-reports-context="ACTIVE|"
data-reports-view-state="OK|EMPTY|PARTIAL|ERROR|LOADING"
data-reports-type="TENANT_OVERVIEW|MEMBERSHIPS_HEALTH|..."
data-reports-route="/tenant/app/reports/..."
```

---

## Contract Tests (RP.C.*)

| ID | Description | Status |
|----|-------------|--------|
| RP.C.1 | Renders deterministically | ✅ |
| RP.C.2 | Report type ∈ SAFE_REPORT_TYPES | ✅ |
| RP.C.3 | View state ∈ SAFE_REPORT_VIEW_STATES | ✅ |
| RP.C.4 | ZERO mutations to protected tables | ✅ |
| RP.C.5 | Navigation stable for 10s | ✅ |
| RP.C.6 | Route detection is pure | ✅ |
| RP.C.7 | Same input → same output (idempotency) | ✅ |
| RP.C.8 | DOM instrumentation present | ✅ |

---

## Resilience Tests (RP.R.*)

| ID | Description | Status |
|----|-------------|--------|
| RP.R.1 | 403 → UI stays visible | ✅ |
| RP.R.2 | 500 → UI stays visible | ✅ |
| RP.R.3 | Timeout → UI stays visible | ✅ |
| RP.R.4 | Invalid JSON → UI stays visible | ✅ |
| RP.R.5 | Partial data ≠ visual regression | ✅ |
| RP.R.6 | Loop detection (ratio < 0.5/s) | ✅ |
| RP.R.7 | No unexpected redirects | ✅ |
| RP.R.8 | Recovery post-failure | ✅ |

---

## Determinism Rules

### Prohibited

- ❌ `Date.now()`
- ❌ `new Date()` (except ISO literals)
- ❌ `Math.random()`
- ❌ UUIDs dinâmicos
- ❌ Side effects / writes
- ❌ `setTimeout` for navigation (SSR/guards)
- ❌ Timezone/locale dependency in calculations

### Required

- ✅ Deterministic payload with fixed timestamp
- ✅ SAFE_REPORT_TYPES and SAFE_REPORT_VIEW_STATES as closed subset
- ✅ Pure route detection
- ✅ Tests with reproducible behavior

---

## Files

### Created (REPORTS1.0)

- `src/types/reports-state.ts`
- `src/domain/reports/protected.ts`
- `src/domain/reports/normalizeReports.ts`
- `src/domain/reports/read.ts`
- `src/domain/reports/indexReports.ts`
- `e2e/helpers/mock-reports-v2.ts`
- `e2e/contract/reports.spec.ts`
- `e2e/resilience/reports.spec.ts`
- `docs/SAFE_GOLD/REPORTS1.0-reports.md` (this file)

### Modified (REPORTS1.0)

- `src/layouts/AppShell.tsx` (DOM instrumentation)

---

## Guarantees

1. **Zero Mutations**: Reports module is 100% read-only
2. **Zero Side Effects**: Navigation does not trigger writes
3. **Zero Time Dependencies**: All timestamps are external
4. **Zero Crashes**: Empty/partial/error data handled gracefully
5. **Zero Loops**: Navigation ratio < 0.5/s enforced

---

## Status

```
REPORTS1.0 — SAFE GOLD v1.0
🔒 READ-ONLY
🧪 CONTRACTUAL
🚫 ZERO SIDE EFFECT
🧠 GOVERNADO
📊 FUNDAÇÃO REPORTS CONFIÁVEL
```

**This document is FROZEN. Any changes require a new PI.**
