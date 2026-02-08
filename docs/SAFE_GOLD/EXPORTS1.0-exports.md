# EXPORTS1.0 — CSV/PDF EXPORT HARDENING (SAFE GOLD)

## Status

🧊 **FROZEN** — SAFE GOLD v1.0

---

## Objective

Seal the Export module (CSV/PDF) to ensure:

- ❌ NO mutations during export
- ❌ NO implicit time dependencies
- ❌ NO navigation loops or crashes
- ❌ NO side effects
- ✅ 100% deterministic output
- ✅ READ-ONLY pure operations
- ✅ Idempotent re-execution
- ✅ Graceful degradation on failures

---

## Scope

### In Scope

| Feature | Status |
|---------|--------|
| CSV export (tabular data) | ✅ |
| PDF export (formatted reports) | ✅ |
| Reports/Analytics exports | ✅ |
| Admin Console exports | ✅ |

### Out of Scope

| Feature | Reason |
|---------|--------|
| File uploads | Different flow |
| Digital signatures | Security complexity |
| Persistent file storage | Requires mutation |

---

## SAFE GOLD Enums

### Export Types

```typescript
export const SAFE_EXPORT_TYPES = [
  'CSV',
  'PDF',
] as const;
```

### Export View States

```typescript
export const SAFE_EXPORT_VIEW_STATES = [
  'READY',      // Export available, waiting for action
  'GENERATING', // Export in progress
  'DONE',       // Export completed successfully
  'ERROR',      // Export failed
] as const;
```

---

## Mutation Boundary

### Protected Tables (NO mutations during export)

```typescript
export const EXPORTS_PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'memberships',
  'athletes',
  'events',
  'reports',
  'tenant_billing',
  'tenant_invoices',
] as const;
```

**Rule**: Any `POST`, `PUT`, `PATCH`, or `DELETE` to these tables during export operations FAILS the contract test.

---

## Normalizers (Pure Functions)

### `normalizeExportViewState(input)`

Maps raw state to deterministic view state:

| Input | Output |
|-------|--------|
| `'GENERATING'` | `'GENERATING'` |
| `'LOADING'`, `'PROCESSING'` | `'GENERATING'` |
| `'DONE'` | `'DONE'` |
| `'COMPLETE'`, `'SUCCESS'` | `'DONE'` |
| `'ERROR'`, `'FAILED'` | `'ERROR'` |
| Others | `'READY'` |

### `deriveExportViewState(isGenerating, isComplete, hasError)`

```typescript
if (hasError) return 'ERROR';
if (isComplete) return 'DONE';
if (isGenerating) return 'GENERATING';
return 'READY';
```

---

## Determinism Rules

### Prohibited

- ❌ `Date.now()`
- ❌ `new Date()` (except ISO literals)
- ❌ `Math.random()`
- ❌ Dynamic UUIDs
- ❌ Implicit time calculations

### Required

- ✅ `generated_at: FIXED_TIMESTAMP_ISO`
- ✅ `export_id: FIXED_IDS.EXPORT_ID`
- ✅ All enums from SAFE GOLD subset
- ✅ Deterministic content hashing

---

## DOM Instrumentation

### AppShell Attributes

```html
data-export-type="CSV|PDF|"
data-export-view-state="READY|GENERATING|DONE|ERROR"
data-export-route="/tenant/app/export/..."
```

### Export Root (when present)

```html
data-testid="export-root"
data-export-type="CSV"
data-export-view-state="DONE"
```

---

## Idempotency Contract

**Same input MUST produce same output:**

```typescript
// Two exports with identical parameters
const export1 = generateExport({ type: 'CSV', data: athletes });
const export2 = generateExport({ type: 'CSV', data: athletes });

// MUST be identical
expect(export1.content).toBe(export2.content);
expect(export1.hash).toBe(export2.hash);
expect(export1.metadata).toEqual(export2.metadata);
```

---

## Contract Tests (EXPORT.C.*)

| ID | Description | Status |
|----|-------------|--------|
| EXPORT.C.1 | Renders deterministically | ✅ |
| EXPORT.C.2 | Export type ∈ SAFE_EXPORT_TYPES | ✅ |
| EXPORT.C.3 | View state ∈ SAFE_EXPORT_VIEW_STATES | ✅ |
| EXPORT.C.4 | NO mutations to protected tables | ✅ |
| EXPORT.C.5 | Navigation stable for 10s | ✅ |
| EXPORT.C.6 | Idempotent re-execution | ✅ |
| EXPORT.C.7 | Empty data ≠ crash | ✅ |

---

## Resilience Tests (EXPORT.R.*)

| ID | Description | Status |
|----|-------------|--------|
| EXPORT.R.1 | 403 → UI stays visible | ✅ |
| EXPORT.R.2 | 500 → UI stays visible | ✅ |
| EXPORT.R.3 | Timeout → UI stays visible | ✅ |
| EXPORT.R.4 | Invalid JSON → UI stays visible | ✅ |
| EXPORT.R.5 | Loop detection (ratio < 0.5/s) | ✅ |
| EXPORT.R.6 | Recovery post-failure | ✅ |
| EXPORT.R.7 | No unexpected redirects | ✅ |
| EXPORT.R.8 | Partial failure ≠ broken UI | ✅ |

---

## Mock Data (Deterministic)

### CSV Content

```csv
id,name,email,created_at
athlete_001,João Silva,joao@example.com,2026-02-07T12:00:00.000Z
athlete_002,Maria Santos,maria@example.com,2026-02-07T12:00:00.000Z
athlete_003,Pedro Costa,pedro@example.com,2026-02-07T12:00:00.000Z
```

### PDF Metadata

```json
{
  "export_id": "export_pdf_01",
  "type": "PDF",
  "generated_at": "2026-02-07T12:00:00.000Z",
  "page_count": 3,
  "size_bytes": 45678,
  "content_hash": "sha256_fixed_abc123def456"
}
```

---

## Files

### Created (EXPORTS1.0)

- `src/types/export-state.ts`
- `src/domain/exports/normalize.ts`
- `e2e/helpers/mock-exports.ts`
- `e2e/contract/exports.spec.ts`
- `e2e/resilience/exports.spec.ts`
- `docs/SAFE_GOLD/EXPORTS1.0-exports.md` (this file)

### Modified (EXPORTS1.0)

- `src/layouts/AppShell.tsx` (DOM instrumentation)

---

## Guarantees

1. **Zero Mutations**: Exports are 100% read-only
2. **Zero Side Effects**: Export does not trigger writes
3. **Zero Time Dependencies**: All timestamps are external
4. **Zero Crashes**: Empty/error data handled gracefully
5. **Zero Loops**: Navigation ratio < 0.5/s enforced
6. **Idempotent**: Same input → same output

---

## Status

```
EXPORTS1.0 — SAFE GOLD v1.0
🔒 READ-ONLY
🧪 CONTRACTUAL
🔄 IDEMPOTENT
🚫 ZERO SIDE EFFECT
🧠 GOVERNADO
```

**This document is FROZEN. Any changes require a new PI.**
