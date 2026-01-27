# 🔐 Security & Authentication Contract

> **Version**: 1.1.0  
> **Status**: CONGELADO  
> **Last Updated**: 2026-01-27  
> **Parent Document**: [SSF Constitution](./SSF-CONSTITUTION.md)

## Overview

This document defines the FORMAL security and authentication contract for the application.
All developers MUST follow these rules. Violations are considered security bugs.

> ⚠️ Este documento faz parte da Constituição SSF e está CONGELADO.

---

## 1. Auth State Machine

### Valid States

| State | Description |
|-------|-------------|
| `unauthenticated` | No session, no user context |
| `authenticating` | Session check or login in progress |
| `authenticated` | Valid session, user data loaded |
| `expired` | Session expired, requires re-authentication |
| `error` | Auth system error |

### Transition Matrix

```
┌─────────────────┐
│ unauthenticated │◄──────────────────────────────────┐
└────────┬────────┘                                   │
         │ (login started)                            │
         ▼                                            │
┌─────────────────┐                                   │
│ authenticating  │──────────(auth failed)───────────►│
└────────┬────────┘                                   │
         │ (auth success)                             │
         ▼                                            │
┌─────────────────┐                                   │
│ authenticated   │──────────(logout)─────────────────┤
└────────┬────────┘                                   │
         │ (token expired)                            │
         ▼                                            │
┌─────────────────┐                                   │
│    expired      │───────────────────────────────────┘
└─────────────────┘
```

### Transition Rules

| From | To | Allowed? |
|------|-----|----------|
| unauthenticated | authenticating | ✅ |
| authenticating | authenticated | ✅ |
| authenticating | error | ✅ |
| authenticating | unauthenticated | ✅ |
| authenticated | expired | ✅ |
| authenticated | unauthenticated (logout) | ✅ |
| expired | unauthenticated | ✅ |
| error | unauthenticated | ✅ |
| **Any other** | **Any** | ❌ BUG |

---

## 2. Security Boundary

### Principle
> **No component individually decides logout, redirect, or session reset.**

All security events flow through `src/lib/auth/security-boundary.ts`.

### Security Events

| Event | Action |
|-------|--------|
| `SESSION_EXPIRED` | Clear session → Redirect /login → Show message |
| `TOKEN_INVALID` | Clear session → Redirect /login → Show warning |
| `TOKEN_REVOKED` | Clear session → Redirect /login → Show warning |
| `UNAUTHORIZED_REQUEST` (401) | Clear session → Redirect /login |
| `FORBIDDEN_REQUEST` (403) | Redirect /portal (no clear) |
| `REFRESH_FAILED` | Clear session → Redirect /login |
| `NETWORK_ERROR` | Show error (no redirect) |
| `LOGOUT_REQUESTED` | Clear session → Redirect /login |

---

## 3. Redirect Decision Hub

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     /portal                              │
│            (SINGLE DECISION POINT)                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Not authenticated? → /login                         │
│  2. Global Superadmin? → /admin                         │
│  3. Admin/Staff of tenant? → /{tenant}/app              │
│  4. Athlete? → /{tenant}/portal                         │
│  5. Pending membership? → /{tenant}/membership/status   │
│  6. No context? → /join                                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Rules

| Rule | Description |
|------|-------------|
| `/portal` is SOVEREIGN | Only place that decides final destination |
| Guards redirect TO `/portal` | Never to final destinations |
| Exception: `/login` redirect | Allowed when not authenticated |
| Anti-loop protection | useRef ensures single execution per session |

---

## 4. Session Lifecycle

### Scenarios Covered

| Scenario | Behavior |
|----------|----------|
| Token invalid on app load | Redirect to /login with clean state |
| Token expires during navigation | Redirect to /login with message |
| Token revoked by backend | Redirect to /login with warning |
| Manual session clear (cookies) | Next request redirects to /login |
| Refresh token fails | Clear session, redirect to /login |

### State Cleanup Checklist

When session ends, these MUST be cleared:
- [x] Supabase session (via signOut)
- [x] React state (currentUser = null)
- [x] Any cached user data (React Query invalidation)
- [x] In-memory sensitive data
- [x] Navigation history (replace, not push)

---

## 5. Async Effect Hardening

### Required Patterns

```typescript
// ✅ CORRECT: AbortController in auth effects
useEffect(() => {
  const controller = new AbortController();
  
  fetchUserProfile(controller.signal);
  
  return () => controller.abort();
}, []);

// ❌ WRONG: No cleanup
useEffect(() => {
  fetchUserProfile(); // Can cause setState after unmount
}, []);
```

### Race Condition Prevention

```typescript
// ✅ CORRECT: Guard prevents duplicate execution
const hasProcessedRef = useRef(false);

useEffect(() => {
  if (hasProcessedRef.current) return;
  hasProcessedRef.current = true;
  
  resolveDestination();
}, [dependencies]);
```

---

## 6. Anti-Patterns (PROHIBITED)

| Pattern | Why Prohibited |
|---------|----------------|
| `setTimeout` for redirect | Non-deterministic, causes race conditions |
| Boolean-only auth check | Missing loading/error states |
| Direct localStorage auth check | Can be manipulated by users |
| Component-level signOut | Bypasses security boundary |
| Promise.then without cleanup | Can cause setState after unmount |
| Global mutable flags | Race conditions in concurrent renders |

---

## 7. E2E Security Tests

Required test coverage:

| Test | File |
|------|------|
| Session expiry redirect | `e2e/security/auth-state-machine.spec.ts` |
| No redirect loops | `e2e/routing/guards.spec.ts` |
| 401 handling | `e2e/security/auth-state-machine.spec.ts` |
| 403 handling | `e2e/security/auth-state-machine.spec.ts` |
| Logout clears state | `e2e/security/auth-state-machine.spec.ts` |
| Deep link protection | `e2e/security/auth-state-machine.spec.ts` |

---

## 8. Pre-Merge Security Checklist

Before merging any auth-related changes:

- [ ] No new implicit states introduced
- [ ] All transitions follow the state machine
- [ ] Security events go through the boundary
- [ ] No setTimeout for redirects
- [ ] AbortController used in async effects
- [ ] Guards redirect to /portal only
- [ ] E2E tests pass
- [ ] No console warnings related to auth
- [ ] No React state updates after unmount

---

## 9. Implementation Files

| File | Purpose |
|------|---------|
| `src/lib/auth/auth-state-machine.ts` | State machine types and transitions |
| `src/lib/auth/security-boundary.ts` | Centralized security event handling |
| `src/contexts/AuthContext.tsx` | React auth state management |
| `src/pages/PortalRouter.tsx` | Single decision hub |
| `src/components/auth/RequireRoles.tsx` | Role-based guard |
| `src/components/auth/AthleteRouteGuard.tsx` | Athlete route protection |

---

## 10. Incident Response

If a security issue is detected:

1. **STOP** all auth-related deployments
2. Check decision logs: `security_events` table
3. Verify state transitions in AuthContext
4. Review `/portal` decision tree
5. Run full E2E security suite
6. Document findings in this contract

---

*This document is the source of truth for auth security. When in doubt, follow this contract.*
