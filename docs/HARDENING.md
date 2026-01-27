# 🔐 HARDENING.md — Security, Stability & Best Practices

**Version:** 1.2.0 (Final Sweep Complete)  
**Last Updated:** 2026-01-27

This document describes the hardening measures implemented to ensure security, stability, and reliability of the application.

**Related Documents:**
- [SSF Constitution](./SSF-CONSTITUTION.md) — Documento constitucional (precedência máxima)
- [Security Auth Contract](./SECURITY-AUTH-CONTRACT.md) — Auth state machine, security boundary, session lifecycle
- [UI Governance](./UI-GOVERNANCE.md) — Component patterns and ref safety
- [Security Baseline v1](./SECURITY-BASELINE-v1.md) — Initial security implementation

---

## Table of Contents

1. [Overview](#overview)
2. [Risks Addressed](#risks-addressed)
3. [Auth Security Hardening](#auth-security-hardening)
4. [Mandatory Patterns](#mandatory-patterns)
5. [Utilities Reference](#utilities-reference)
6. [Testing Guide](#testing-guide)
7. [Pre-Merge Checklist](#pre-merge-checklist)

---

## Overview

The hardening pack addresses common classes of bugs and security issues:

- **State/Effect Issues**: Race conditions, stale closures, setState after unmount
- **Routing Issues**: Redirect loops, inconsistent guard behavior
- **Error Handling**: Unhandled exceptions, poor user messaging
- **Network Issues**: Timeouts, unhandled failures, missing retries
- **UI Issues**: Invisible actions, broken loading states

---

## Risks Addressed

### 1. React State & Effect Bugs

| Risk | Mitigation |
|------|------------|
| `setState` after unmount | `useIsMounted()` hook |
| Double-run in StrictMode | `useOnceGuard()` with deps tracking |
| Stale closures | `useSafeState()` wrapper |
| Missing fetch cleanup | `useAbortController()` |
| Race conditions in loading | `useLoadingCounter()` |

### 2. Routing & Guards

| Risk | Mitigation |
|------|------------|
| Redirect loops | Single decision hub (`/portal`) |
| Inconsistent auth checks | `hasProcessedRef` guard pattern |
| Stale user state | Reset guard when userId changes |
| Missing tenant fallback | Explicit error states |

### 3. Error Handling

| Risk | Mitigation |
|------|------------|
| Unhandled render errors | `ErrorBoundary` with reporting |
| User-hostile error messages | `formatUserError()` function |
| Lost error context | Structured error reporting with IDs |

### 4. Network

| Risk | Mitigation |
|------|------------|
| Hanging requests | 15s default timeout |
| Transient failures | Automatic retry (GET only, max 2) |
| Missing correlation | Auto-generated correlation IDs |
| Network errors | Standardized `HttpError` class |

---

## Auth Security Hardening

> Full details in [SECURITY-AUTH-CONTRACT.md](./SECURITY-AUTH-CONTRACT.md)

### Auth State Machine

The authentication system uses a formal state machine:

```
unauthenticated → authenticating → authenticated → expired → unauthenticated
                              ↘ error ↗
```

**Files:**
- `src/lib/auth/auth-state-machine.ts` — State types and transitions
- `src/lib/auth/security-boundary.ts` — Centralized security event handling

### Security Boundary

All security events (401, 403, session expiry) flow through a centralized boundary:

| Event | Action |
|-------|--------|
| `SESSION_EXPIRED` | Clear session → /login |
| `TOKEN_INVALID` | Clear session → /login |
| `UNAUTHORIZED_REQUEST` (401) | Clear session → /login |
| `FORBIDDEN_REQUEST` (403) | Redirect /portal (no clear) |

### Portal Decision Hub

`/portal` is the ONLY component that decides final destination post-login:

1. Not authenticated → /login
2. Global Superadmin → /admin
3. Admin/Staff → /{tenant}/app
4. Athlete → /{tenant}/portal
5. No context → /join

## Mandatory Patterns

### Pattern 1: AbortController in useEffect

```typescript
// ❌ DON'T
useEffect(() => {
  fetch('/api/data').then(setData);
}, []);

// ✅ DO
useEffect(() => {
  const controller = new AbortController();
  
  fetch('/api/data', { signal: controller.signal })
    .then(res => res.json())
    .then(setData)
    .catch(e => {
      if (e.name !== 'AbortError') throw e;
    });
  
  return () => controller.abort();
}, []);
```

### Pattern 2: Guard Refs for One-Time Execution

```typescript
// ✅ DO - Prevent double-run in StrictMode
const hasProcessedRef = useRef(false);
const lastUserIdRef = useRef<string | null>(null);

useEffect(() => {
  if (lastUserIdRef.current !== userId) {
    lastUserIdRef.current = userId;
    hasProcessedRef.current = false;
  }
  
  if (hasProcessedRef.current) return;
  hasProcessedRef.current = true;
  
  // One-time initialization
}, [userId]);
```

### Pattern 3: Deterministic Loading

```typescript
// ❌ DON'T - Race condition
setLoading(true);
await Promise.all([fetch1(), fetch2()]);
setLoading(false); // May set false before all data is ready

// ✅ DO - Counter-based
const { isLoading, startLoading, stopLoading } = useLoadingCounter();

async function loadAll() {
  startLoading();
  try {
    await Promise.all([fetch1(), fetch2()]);
  } finally {
    stopLoading();
  }
}
```

### Pattern 4: Error Boundary Usage

```typescript
// ✅ DO - Wrap risky components
<ErrorBoundary componentName="Dashboard">
  <DashboardContent />
</ErrorBoundary>

// ✅ DO - Use HOC for pages
export default withErrorBoundary(MembershipDetails, {
  componentName: 'MembershipDetails'
});
```

### Pattern 5: Safe HTTP Requests

```typescript
import { http, httpGet, HttpError } from '@/lib/http';

// ✅ DO - Use hardened client
try {
  const { data } = await httpGet<User[]>('/api/users');
} catch (error) {
  if (error instanceof HttpError) {
    if (error.code === 'TIMEOUT') {
      // Handle timeout
    }
  }
}
```

---

## Utilities Reference

### `src/lib/react/safe-effect.ts`

| Hook | Purpose |
|------|---------|
| `useIsMounted()` | Returns function that checks if component is mounted |
| `useOnceGuard(deps)` | Ref that resets when deps change, for one-time execution |
| `useAbortController()` | Auto-aborting AbortController on unmount |
| `useSafeState(setState)` | setState wrapper that only updates if mounted |
| `useLoadingCounter()` | Deterministic loading for parallel operations |
| `useAsyncEffect(fn, deps)` | Async effect with built-in abort handling |

### `src/lib/observability/logger.ts`

| Export | Purpose |
|--------|---------|
| `createLogger(scope)` | Create scoped logger |
| `logger` | Default app logger |
| `authLogger` | Auth state transitions |
| `routerLogger` | Navigation decisions |
| `networkLogger` | API calls |

### `src/lib/observability/error-report.ts`

| Export | Purpose |
|--------|---------|
| `reportError(error, context)` | Report error with context |
| `reportErrorBoundary(error, info)` | Report React error boundary catch |
| `reportNetworkError(error, endpoint)` | Report fetch failure |
| `formatUserError(error)` | Get user-friendly message |
| `getRecentErrors()` | Get error buffer for debugging |

### `src/lib/http/http.ts`

| Export | Purpose |
|--------|---------|
| `http<T>(url, options)` | Main fetch wrapper |
| `httpGet<T>(url)` | GET convenience method |
| `httpPost<T>(url, body)` | POST convenience method |
| `HttpError` | Standardized error class |

---

## Testing Guide

### Run All E2E Tests

```bash
npx playwright test
```

### Run Specific Test Suites

```bash
# Routing guards
npx playwright test e2e/routing/

# UI contracts
npx playwright test e2e/ui/

# Security matrix
npx playwright test e2e/security/
```

### Run Unit Tests

```bash
npm run test
# or
bunx vitest run
```

### Test Coverage

| Suite | File | Coverage |
|-------|------|----------|
| Loading Contract | `e2e/ui/loading-contract.spec.ts` | Page render states |
| Routing Guards | `e2e/routing/guards.spec.ts` | Auth redirects, loops |
| Session Expiry | `e2e/routing/session-expiry.spec.ts` | Token handling |
| Console Warnings | `e2e/ui/console-warnings.spec.ts` | React warnings |
| Actions Visibility | `e2e/ui/actions-visibility.spec.ts` | Button visibility |

---

## Pre-Merge Checklist

### Code Quality

- [ ] No `eslint` errors
- [ ] No TypeScript errors
- [ ] All imports resolve

### React Patterns

- [ ] All `useEffect` with fetch have `AbortController`
- [ ] No `setState` without mount check in async operations
- [ ] Guard refs for one-time initializations
- [ ] Error boundaries on complex components

### UI/UX

- [ ] Loading states are deterministic
- [ ] Empty states exist for data-driven components
- [ ] Actions are visible without hover
- [ ] No flash of empty content

### Security

- [ ] Protected routes have guards
- [ ] No redirect loops possible
- [ ] Errors don't leak sensitive info

### Testing

- [ ] E2E tests pass: `npx playwright test`
- [ ] Unit tests pass: `npm run test`
- [ ] No console warnings in tests

### Documentation

- [ ] New utilities documented
- [ ] Breaking changes noted
- [ ] Examples provided

---

## Changelog (v1.2.0 — Final Sweep)

### Fixed Edge Cases:
- **TenantContext**: Added `AbortController` and `isMountedRef` to prevent `setState` after unmount
- **AuthCallback**: Added `AbortController`, `hasProcessedRef`, and `isMountedRef` to prevent race conditions and double execution
- **AthleteRouteGuard**: Removed direct `navigate()` call in render path; now handled entirely in `useEffect` with proper guard

### Verified OK:
- **Login.tsx**: Correctly navigates to `/portal` post-login (no auto-redirect for authenticated users - expected behavior)
- **PortalRouter.tsx**: Already has `AbortController` and `hasProcessedRef` pattern
- **RequireRoles.tsx**: Already has `hasRedirected` ref to prevent loops
- **ImpersonationContext.tsx**: Already has validation interval and expiration timeout cleanup

---

## Future Improvements

1. **Sentry Integration**: Replace console logging with Sentry SDK
2. **Performance Monitoring**: Add Core Web Vitals tracking
3. **Feature Flags**: Add runtime feature flag system
4. **Session Refresh**: Implement proactive token refresh

---

*This document is part of the TATAME PRO security and quality baseline.*
