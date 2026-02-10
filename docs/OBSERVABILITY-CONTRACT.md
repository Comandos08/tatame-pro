# Observability Contract — TATAME Pro

> **Version:** 1.0.0  
> **Status:** FROZEN  
> **PI:** E3 — Contrato de Observabilidade  
> **SAFE GOLD:** ✅  
> **Dependencies:** E2 (Error Contract), B3 (Semantic Audit)

## Principles

1. Nothing critical happens without leaving a trace.
2. Observability does not interfere with flow.
3. A metric without an associated decision is noise.
4. Audit ≠ Metric ≠ Health — but they converse.
5. Contract first, dashboards later.

---

## Observability Pillars

### 1️⃣ Audit (PI B3)

- **Source:** `audit_logs` table
- **Scope:** Human and systemic actions
- **Governance:** Immutable (INSERT-only)
- **Answers:** Who did what, when, and in what context

### 2️⃣ Institutional Errors (PI E2)

- **Source:** `InstitutionalError.code`
- **Scope:** System-perceived failures
- **Severity:** INFO / WARNING / ERROR / CRITICAL
- **Answers:** What failed and how severe it is

### 3️⃣ Health Signals (PI E3)

- **Source:** Derived from system behavior
- **Scope:** System health indicators
- **Answers:** How the system is behaving right now

---

## Health Signal Types

| Signal | Description |
|--------|-------------|
| `ERROR_RATE` | Rate of errors in a time window |
| `LATENCY` | Response time degradation |
| `THROUGHPUT` | Volume of operations |
| `DEGRADED_MODE` | System operating with reduced capability |
| `DEPENDENCY_DOWN` | External dependency unavailable |

---

## Health Signal Structure

```typescript
interface HealthSignal {
  signal: HealthSignalType;
  status: 'OK' | 'WARNING' | 'CRITICAL';
  source: 'SYSTEM' | 'BILLING' | 'IDENTITY' | 'INTEGRATION';
  observedAt: string; // ISO 8601
  relatedErrorCode?: string; // Links to E2
}
```

---

## Semantic Integration Map

| Event | Audit | Error | Health |
|-------|-------|-------|--------|
| Login failure | ✅ `LOGIN_FAILED` | ✅ `AUTH-002` | — |
| Billing blocks event | ✅ `BILLING_GATE_BLOCKED` | ✅ `BILLING-003` | ⚠️ WARNING |
| Service down | — | ✅ `SYS-001` | 🔴 CRITICAL |
| Degraded mode | — | — | ⚠️ DEGRADED_MODE |
| Navigation violation | ✅ `ACCESS_DENIED` | ✅ `ACCESS-004` | — |

---

## Canonical Surface: `/admin/health`

The single hub for all observability, containing:

1. **Health Summary** — Global status (OK / WARNING / CRITICAL)
2. **Recent Critical Events** — Derived from `audit_logs`
3. **Recent Institutional Errors** — Grouped by code
4. **Behavioral Indicators** — Derived, read-only
5. **Audit Section** — via `#audit` anchor

- ❌ No operational actions
- ❌ No fix/repair buttons
- ✅ Read-only governed view

---

## Hard Rules

1. ❌ No metric without a contract
2. ❌ No dashboard that decides flow
3. ❌ No technical logs exposed to users
4. ❌ No observability in tenant routes
5. ❌ No feature flags as health signals

---

## Files

| File | Purpose |
|------|---------|
| `docs/OBSERVABILITY-CONTRACT.md` | This document |
| `src/lib/observability/types.ts` | HealthSignal types & DEV validation |
| `src/lib/observability/index.ts` | Re-exports |
| `src/lib/errors/institutionalErrors.ts` | Error catalog (PI E2) |
| `/admin/health` | Canonical observability surface |

---

## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-02-10 | Initial observability contract (PI E3) — FROZEN |
