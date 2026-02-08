# HEALTH1.0 — SYSTEM HEALTH ROUTE RECLASSIFICATION (SAFE GOLD)

## Status

🧊 **FROZEN** — SAFE GOLD v1.0

---

## Objective

Reclassify the System Health route to Admin Global context, eliminating improper dependency on impersonation and ensuring:

- ✅ Direct access by SUPERADMIN_GLOBAL
- ✅ Zero side effects
- ✅ Zero mutations
- ✅ Deterministic behavior
- ✅ Correct observability (telemetry)

---

## Architectural Decision

**Option Adopted: A — RECOMMENDED**

- ✔️ Health as ADMIN GLOBAL ROUTE
- ✔️ Outside Tenant Context
- ✔️ No impersonation required
- ✔️ Explicit guard

---

## Access Control

### Allowed Roles

```typescript
export const HEALTH_ALLOWED_ROLES = ['SUPERADMIN_GLOBAL'] as const;
```

### Prohibited

- ❌ ADMIN_TENANT
- ❌ COACH
- ❌ ATHLETE
- ❌ Impersonated sessions

### Access Rule Contract

```typescript
export const HEALTH_ACCESS_RULE = {
  requiresRole: 'SUPERADMIN_GLOBAL',
  requiresImpersonation: false,
  tenantContext: 'forbidden',
} as const;
```

---

## Routes

### Removed

- ❌ `/:tenantSlug/app/health`
- ❌ `/app/health`

### Created

- ✅ `/admin/health`

---

## SAFE GOLD Enums

### Health Statuses

```typescript
export const SAFE_HEALTH_STATUSES = [
  'OK',
  'DEGRADED',
  'CRITICAL',
  'UNKNOWN',
] as const;
```

### Health View States

```typescript
export const SAFE_HEALTH_VIEW_STATES = [
  'OK',
  'EMPTY',
  'LOADING',
  'ERROR',
] as const;
```

### Access Denial Reasons

```typescript
export const HEALTH_ACCESS_DENIAL_REASONS = [
  'INSUFFICIENT_ROLE',
  'IMPERSONATION_FORBIDDEN',
  'NOT_AUTHENTICATED',
] as const;
```

---

## Protected Tables (Mutation Boundary)

```typescript
export const HEALTH_PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'tenant_billing',
  'audit_logs',
  'memberships',
  'events',
] as const;
```

**Rule**: Any `POST`, `PUT`, `PATCH`, or `DELETE` to these tables during `/admin/health` navigation FAILS the contract test.

---

## Observability Events

### HEALTH_PAGE_ACCESSED

```json
{
  "event_type": "HEALTH_PAGE_ACCESSED",
  "category": "OBSERVABILITY",
  "metadata": {
    "actor_role": "SUPERADMIN_GLOBAL",
    "route": "/admin/health",
    "tenant_context": null,
    "impersonation": false
  }
}
```

### HEALTH_ACCESS_DENIED

```json
{
  "event_type": "HEALTH_ACCESS_DENIED",
  "category": "SECURITY",
  "metadata": {
    "reason": "INSUFFICIENT_ROLE | IMPERSONATION_FORBIDDEN | NOT_AUTHENTICATED",
    "route": "/admin/health"
  }
}
```

---

## DOM Instrumentation

### SystemHealth Page Attributes

```html
data-testid="system-health-page"
data-health-status="OK|DEGRADED|CRITICAL|UNKNOWN"
data-health-view-state="OK|EMPTY|LOADING|ERROR"
data-health-route="/admin/health"
data-health-context="ADMIN_GLOBAL"
```

### Access Denied Attributes

```html
data-testid="health-access-denied"
data-health-denial-reason="INSUFFICIENT_ROLE|IMPERSONATION_FORBIDDEN|NOT_AUTHENTICATED"
```

---

## Contract Tests (HEALTH.C.*)

| ID | Description | Status |
|----|-------------|--------|
| HEALTH.C.1 | Access direct by SUPERADMIN_GLOBAL | ✅ |
| HEALTH.C.2 | Tenant admin is blocked | ✅ |
| HEALTH.C.3 | ZERO mutations to protected tables | ✅ |
| HEALTH.C.4 | Navigation stable for 10s | ✅ |
| HEALTH.C.5 | Deterministic rendering | ✅ |
| HEALTH.C.6 | DOM instrumentation present | ✅ |

---

## Resilience Tests (HEALTH.R.*)

| ID | Description | Status |
|----|-------------|--------|
| HEALTH.R.1 | 403 → UI stays visible | ✅ |
| HEALTH.R.2 | 500 → UI stays visible | ✅ |
| HEALTH.R.3 | Timeout → UI stays visible | ✅ |
| HEALTH.R.4 | Invalid JSON → UI stays visible | ✅ |
| HEALTH.R.5 | Loop detection (ratio < 0.5/s) | ✅ |
| HEALTH.R.6 | No unexpected redirects | ✅ |
| HEALTH.R.7 | Recovery post-failure | ✅ |

---

## Determinism Rules

### Prohibited

- ❌ `Date.now()`
- ❌ `new Date()` (dynamic)
- ❌ `Math.random()`
- ❌ Impersonation context
- ❌ TenantContext
- ❌ Side effects
- ❌ Automatic redirects

### Required

- ✅ Explicit guard
- ✅ Isolated route
- ✅ Read-only operations
- ✅ Standardized observability
- ✅ Deterministic tests

---

## Files

### Created (HEALTH1.0)

- `src/types/health-state.ts`
- `src/domain/health/normalize.ts`
- `src/domain/health/index.ts`
- `src/pages/admin/SystemHealth.tsx`
- `e2e/helpers/mock-health.ts`
- `e2e/contract/health.spec.ts`
- `e2e/resilience/health.spec.ts`
- `docs/SAFE_GOLD/HEALTH1.0-system-health.md` (this file)

### Modified (HEALTH1.0)

- `src/App.tsx` (added /admin/health route)

---

## Guarantees

1. **Zero Tenant Context**: Health module has no TenantContext dependency
2. **Zero Impersonation**: Direct superadmin access only
3. **Zero Mutations**: Navigation does not trigger writes
4. **Zero Redirects**: Explicit UI for denied access (no redirect loops)
5. **Zero Loops**: Navigation ratio < 0.5/s enforced

---

## Status

```
HEALTH1.0 — SAFE GOLD v1.0
🧠 ADMIN-GLOBAL
🚫 NO IMPERSONATION
🔒 READ-ONLY
🧪 CONTRACTUAL
📊 OBSERVABLE
```

**This document is FROZEN. Any changes require a new PI.**
