# REPORTS1.0 — REPORTS/ANALYTICS HARDENING (SAFE GOLD)

## Status

🧊 **FROZEN** — SAFE GOLD v1.0

---

## Objective

Seal the Reports/Analytics module to ensure:

- ❌ NO mutations during browsing
- ❌ NO implicit time dependencies
- ❌ NO navigation loops or crashes
- ❌ NO domain logic outside normalizers
- ✅ 100% deterministic rendering
- ✅ READ-ONLY pure operations
- ✅ Graceful degradation on failures

---

## SAFE GOLD Enums

### Report Types

```typescript
export const SAFE_REPORT_TYPES = [
  'OVERVIEW',
  'FINANCIAL',
  'ATTENDANCE',
  'ATHLETES',
  'EVENTS',
] as const;
```

### Report Scopes

```typescript
export const SAFE_REPORT_SCOPES = [
  'TENANT',
  'GLOBAL',
] as const;
```

### Report Modes

```typescript
export const SAFE_REPORT_MODES = [
  'GLOBAL',
  'TENANT',
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

### Protected Tables (NO mutations during reports browsing)

```typescript
export const REPORTS_PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'memberships',
  'athletes',
  'academies',
  'events',
  'event_brackets',
  'tenant_billing',
  'tenant_invoices',
] as const;
```

**Rule**: Any `POST`, `PUT`, `PATCH`, or `DELETE` to these tables during `/reports/*` navigation FAILS the contract test.

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

### `deriveReportMode(tenantId, isGlobal)`

```typescript
if (isGlobal) return 'GLOBAL';
if (tenantId) return 'TENANT';
return 'TENANT';
```

---

## DOM Instrumentation

### AppShell Attributes

```html
data-report-mode="TENANT|GLOBAL"
data-report-view-state="OK|EMPTY|PARTIAL|ERROR"
data-report-route="/tenant/app/reports/..."
```

### Reports Container (when present)

```html
data-testid="reports-root"
data-report-type="OVERVIEW|FINANCIAL|..."
data-report-scope="TENANT|GLOBAL"
data-report-view-state="LOADING|READY|ERROR"
```

---

## Contract Tests (REP.C.*)

| ID | Description | Status |
|----|-------------|--------|
| REP.C.1 | Renders deterministically | ✅ |
| REP.C.2 | Report type ∈ SAFE_REPORT_TYPES | ✅ |
| REP.C.3 | Report scope ∈ SAFE_REPORT_SCOPES | ✅ |
| REP.C.4 | View state ∈ SAFE enum | ✅ |
| REP.C.5 | NO mutations to protected tables | ✅ |
| REP.C.6 | Navigation stable for 10s | ✅ |
| REP.C.7 | Filters do NOT mutate state | ✅ |
| REP.C.8 | Missing data ≠ crash | ✅ |
| REP.C.9 | Report mode ∈ SAFE_REPORT_MODES | ✅ |

---

## Resilience Tests (REP.R.*)

| ID | Description | Status |
|----|-------------|--------|
| REP.R.1 | 403 → UI stays visible | ✅ |
| REP.R.2 | 500 → UI stays visible | ✅ |
| REP.R.3 | Timeout → UI stays visible | ✅ |
| REP.R.4 | Invalid JSON → UI stays visible | ✅ |
| REP.R.5 | Mixed failures → UI stable | ✅ |
| REP.R.6 | No unexpected redirects | ✅ |
| REP.R.7 | Partial data ≠ visual regression | ✅ |
| REP.R.8 | Loop detection (ratio < 0.5/s) | ✅ |
| REP.R.9 | Navigation continues after recovery | ✅ |

---

## Determinism Rules

### Prohibited

- ❌ `Date.now()`
- ❌ `new Date()` (except ISO literals)
- ❌ `Math.random()`
- ❌ Implicit time calculations
- ❌ Try/catch with silent fallback
- ❌ Inline conditional rendering without state

### Required

- ✅ All timestamps from `FIXED_TIMESTAMP_ISO`
- ✅ All enums from SAFE GOLD subset
- ✅ All state derived via pure normalizers
- ✅ Explicit error boundaries

---

## Files

### Created (REPORTS1.0)

- `src/types/report-state.ts` (extended)
- `src/domain/reports/normalize.ts` (extended)
- `e2e/contract/reports.spec.ts` (extended)
- `e2e/resilience/reports.spec.ts` (extended)
- `e2e/helpers/mock-reports.ts` (extended)
- `docs/SAFE_GOLD/REPORTS1.0-reports-analytics.md` (this file)

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
🧱 FUNDAÇÃO ANALÍTICA CONFIÁVEL
```

**This document is FROZEN. Any changes require a new PI.**
