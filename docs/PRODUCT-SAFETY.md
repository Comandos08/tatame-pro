# 🛡️ PRODUCT SAFETY CONTRACT

> **Version:** 1.0.0  
> **Status:** LOCKED  
> **Last Updated:** 2025-01-30

## Purpose

This document establishes **immutable safety invariants** that guarantee no authenticated user will ever experience:

1. **Infinite loading** without escape
2. **Silent failure** without explanation
3. **Unexplained access denial**

---

## Critical Invariants

### INVARIANT 1: No Infinite Loaders

Every loading state MUST have:

| Requirement | Implementation |
|-------------|----------------|
| UX feedback timeout | 8 seconds → show warning UI |
| Hard timeout | 12 seconds → transition to ERROR state |
| Escape hatch | Retry and Logout buttons always visible |

**Implementation:**
- `IdentityLoadingScreen.tsx` — UX-only 8s timeout
- `IdentityContext.tsx` — Hard 12s abort with `IDENTITY_TIMEOUT` error

### INVARIANT 2: No Silent Errors

Every error MUST:

1. Display a **human-readable message**
2. Provide a **clear suggestion** for next steps
3. Offer an **explicit escape hatch** (Retry/Logout)

**Implementation:**
- `identity-error-escape.ts` — Maps error codes to i18n keys
- `IdentityGate.tsx` — Renders translated error UI

### INVARIANT 3: Explicit State Mapping

Every identity/billing state MUST map to an explicit UI:

| State | UI Component | Escape Hatch |
|-------|--------------|--------------|
| LOADING | IdentityLoadingScreen | Retry, Logout |
| ERROR | IdentityGate error card | Retry, Logout |
| UNAUTHENTICATED | Redirect to /login | — |
| WIZARD_REQUIRED | Redirect to /identity/wizard | — |
| READY | Render children | — |

---

## Error Code Reference

| Code | Meaning | User Message Key |
|------|---------|------------------|
| `TENANT_NOT_FOUND` | Org doesn't exist | `identityError.tenantNotFound.*` |
| `PERMISSION_DENIED` | No access rights | `identityError.permissionDenied.*` |
| `PROFILE_NOT_FOUND` | Profile not created yet | `identityError.profileNotFound.*` |
| `NO_ROLES_ASSIGNED` | Wizard done, no roles | `identityError.noRolesAssigned.*` |
| `BILLING_BLOCKED` | Tenant billing suspended | `identityError.billingBlocked.*` |
| `IDENTITY_TIMEOUT` | 12s hard timeout | `identityError.timeout.*` |
| `IMPERSONATION_INVALID` | Session expired | `identityError.impersonationInvalid.*` |
| `UNKNOWN` | Catch-all | `identityError.unknown.*` |

---

## Forbidden Patterns

### ❌ NEVER DO

1. **Timer-based navigation**
   ```typescript
   // FORBIDDEN
   setTimeout(() => navigate('/login'), 5000);
   ```

2. **Silent error swallowing**
   ```typescript
   // FORBIDDEN
   catch (e) { console.error(e); }
   ```

3. **Implicit redirects**
   ```typescript
   // FORBIDDEN
   if (!user) window.location.href = '/login';
   ```

4. **Generic error messages**
   ```typescript
   // FORBIDDEN
   <p>Something went wrong</p>
   ```

### ✅ ALWAYS DO

1. **Explicit error state with escape hatch**
   ```typescript
   // CORRECT
   if (error) return <IdentityErrorScreen error={error} onRetry={retry} onLogout={logout} />;
   ```

2. **State machine transitions only**
   ```typescript
   // CORRECT
   setState({ phase: 'ERROR', error: { code: 'IDENTITY_TIMEOUT', message: '...' } });
   ```

---

## State → UI → Escape Hatch Matrix

```
┌─────────────────────┬──────────────────────────┬─────────────────────┐
│ Identity State      │ UI Rendered              │ Escape Hatch        │
├─────────────────────┼──────────────────────────┼─────────────────────┤
│ LOADING             │ IdentityLoadingScreen    │ Retry, Logout       │
│ LOADING > 8s        │ Timeout warning card     │ Retry, Logout       │
│ LOADING > 12s       │ ERROR state (automatic)  │ Retry, Logout       │
│ ERROR               │ Error card with code     │ Retry, Logout       │
│ UNAUTHENTICATED     │ Redirect to /login       │ —                   │
│ WIZARD_REQUIRED     │ Redirect to wizard       │ —                   │
│ READY               │ Children                 │ —                   │
└─────────────────────┴──────────────────────────┴─────────────────────┘
```

---

## Billing State Handling

### Transition Matrix (LOGGING ONLY)

The billing transition matrix is **diagnostic only** — it does NOT enforce transitions.

```typescript
VALID_BILLING_TRANSITIONS = {
  TRIALING: ['ACTIVE', 'TRIAL_EXPIRED'],
  TRIAL_EXPIRED: ['ACTIVE', 'PENDING_DELETE'],
  PENDING_DELETE: ['ACTIVE'],
  ACTIVE: ['PAST_DUE', 'CANCELED', 'UNPAID'],
  // ...
}
```

Invalid transitions generate **console warnings** for observability but never block execution.

---

## Diagnostics Requirements

All diagnostics views MUST:

1. Be **READ-ONLY** — no mutations
2. Show **explicit empty states**:
   - "No data available" (empty result set)
   - "No permission" (RLS denied)
3. Never show **silent empty** (blank screen)
4. Never expose **PII** (only operation types, timestamps)

---

## Regression Checklist

Before any deployment, verify:

- [ ] Login flow works (email/password)
- [ ] Logout clears session → /login
- [ ] Loading > 8s shows timeout warning
- [ ] Loading > 12s shows ERROR state with IDENTITY_TIMEOUT
- [ ] All error codes show translated messages
- [ ] Retry button works in error states
- [ ] Logout button works in error states
- [ ] Diagnostics pages show explicit "no data" or "no permission"
- [ ] No infinite loaders in any flow
- [ ] No console errors in auth flow

---

## Constitutional Reference

This contract is subordinate to:

- `docs/SSF-CONSTITUTION.md` — Primary authority
- `docs/IDENTITY-CONTRACT.md` — Identity state machine rules
- `docs/SECURITY-AUTH-CONTRACT.md` — Auth security rules

Any modification requires constitutional review.
