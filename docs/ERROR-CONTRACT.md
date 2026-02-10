# Error Contract — TATAME Pro

> **Version:** 1.0.0  
> **Status:** FROZEN  
> **PI:** E2 — Padronização de Erros Institucionais  
> **SAFE GOLD:** ✅  

## Principles

1. Errors are **institutional communication**, not technical exceptions.
2. Users never see stack traces or raw error messages.
3. **Code** precedes message; **message** precedes detail.
4. Errors inform, they do not decide flow.

---

## Error Format

```typescript
interface InstitutionalError {
  code: string;          // e.g., AUTH-001
  messageKey: string;    // i18n key
  severity: ErrorSeverity;
  httpStatus?: number;
  retryable?: boolean;
  context: ErrorContext;
}
```

---

## Canonical Error Catalog (v1)

### 🔐 Authentication / Identity

| Code | Severity | Usage |
|------|----------|-------|
| `AUTH-001` | ERROR | Session expired |
| `AUTH-002` | ERROR | Invalid credentials |
| `AUTH-003` | WARNING | Access denied |
| `AUTH-004` | ERROR | User not linked |

### 🧑‍⚖️ Authorization / Access

| Code | Severity | Usage |
|------|----------|-------|
| `ACCESS-001` | ERROR | Unauthorized route |
| `ACCESS-002` | ERROR | Invalid persona |
| `ACCESS-003` | ERROR | Cross-context attempt |
| `ACCESS-004` | CRITICAL | Navigation contract violation |

### 💳 Billing

| Code | Severity | Usage |
|------|----------|-------|
| `BILLING-001` | WARNING | Inactive plan |
| `BILLING-002` | ERROR | Limit exceeded |
| `BILLING-003` | ERROR | Gate blocked |

### 🩺 System / Health

| Code | Severity | Usage |
|------|----------|-------|
| `SYS-001` | ERROR | Service unavailable |
| `SYS-002` | WARNING | High latency |
| `SYS-003` | CRITICAL | System failure |
| `SYS-004` | INFO | Degraded mode |

### 📦 Data / Consistency

| Code | Severity | Usage |
|------|----------|-------|
| `DATA-001` | ERROR | Record not found |
| `DATA-002` | ERROR | Inconsistent state |
| `DATA-003` | WARNING | Incomplete data |

---

## Hard Rules

1. ❌ No `throw new Error("free text")` — always use error codes
2. ❌ No `console.error(error.message)` in production
3. ❌ No technical details exposed to users
4. ❌ No different copy for the same error
5. ❌ No HTTP status used as UX semantics

---

## Integration

- `code` is used in: Audit Log, Health Timeline, future alerts
- `severity` guides operational priority, not UX
- All messages go through i18n — zero hardcoded strings

---

## Files

| File | Purpose |
|------|---------|
| `src/lib/errors/institutionalErrors.ts` | Type, catalog, helper |
| `src/lib/errors/index.ts` | Re-exports |
| `src/locales/*.ts` | i18n keys (`institutionalErrors.*`) |

---

## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-02-10 | Initial error contract (PI E2) — FROZEN |
