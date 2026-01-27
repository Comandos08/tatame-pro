
# HOLISTIC ROUTING & AUTH AUDIT — FINDINGS REPORT

## Executive Summary
The system demonstrates a well-architected authentication and authorization flow centered around the `/portal` decision hub. However, several inconsistencies, DOM warnings, and form semantic issues were identified that require attention.

---

## 1. ROUTES INVENTORY

### Route Classification

| Route Pattern | Classification | Guard(s) | Status |
|---------------|---------------|----------|--------|
| `/` | Public | None | ✅ OK |
| `/login` | Public | None | ✅ OK |
| `/forgot-password` | Public | None | ✅ OK |
| `/reset-password` | Public | None | ✅ OK |
| `/help` | Public | None | ✅ OK |
| `/auth/callback` | Public | None (internal logic) | ✅ OK |
| `/join`, `/join/org`, `/join/account`, `/join/confirm` | Public | Internal guards | ✅ OK |
| `/portal` | Auth-only | PortalRouter (internal) | ✅ OK |
| `/admin` | Admin-global | AdminRoute | ✅ OK |
| `/admin/tenants/:tenantId/control` | Admin-global | AdminRoute | ✅ OK |
| `/:tenantSlug` | Public (tenant landing) | TenantLayout | ✅ OK |
| `/:tenantSlug/login` | Public | TenantLayout | ✅ OK |
| `/:tenantSlug/verify/*` | Public | TenantLayout | ✅ OK |
| `/:tenantSlug/academies` | Public | TenantLayout | ✅ OK |
| `/:tenantSlug/rankings` | Public | TenantLayout | ✅ OK |
| `/:tenantSlug/events` | Public | TenantLayout | ✅ OK |
| `/:tenantSlug/membership/new` | Public | TenantLayout | ✅ OK |
| `/:tenantSlug/membership/adult` | Public | TenantLayout | ✅ OK |
| `/:tenantSlug/membership/youth` | Public | TenantLayout | ✅ OK |
| `/:tenantSlug/membership/success` | Public | TenantLayout | ✅ OK |
| `/:tenantSlug/membership/status` | Auth-only (athlete) | AthleteRouteGuard | ✅ OK |
| `/:tenantSlug/membership/renew` | Auth-only (athlete) | AthleteRouteGuard | ✅ OK |
| `/:tenantSlug/portal` | Auth-only (athlete) | AthleteRouteGuard + RequireRoles | ✅ OK |
| `/:tenantSlug/portal/events` | Auth-only (athlete) | AthleteRouteGuard + RequireRoles | ✅ OK |
| `/:tenantSlug/portal/card` | Auth-only (athlete) | AthleteRouteGuard + RequireRoles | ✅ OK |
| `/:tenantSlug/app/*` | Admin-tenant | RequireRoles | ✅ OK |

**Summary:** All routes are properly classified and protected. No unguarded sensitive routes found.

---

## 2. REDIRECT CONSISTENCY FINDINGS

### ✅ CONFIRMED: PortalRouter is the decision hub
The system correctly funnels post-login decisions through `/portal` (PortalRouter.tsx).

### Issues Found:

| Severity | File | Line | Issue | Recommended Fix |
|----------|------|------|-------|-----------------|
| **LOW** | `src/pages/Login.tsx` | 46 | Login navigates to `/portal` after auth — **CORRECT** | No action needed |
| **LOW** | `src/pages/JoinAccount.tsx` | 79 | Navigates to `/join/confirm` — **CORRECT** (wizard flow) | No action needed |
| **LOW** | `src/pages/ResetPassword.tsx` | 106-108 | Uses `setTimeout + navigate('/login')` after password reset | Consider using toast + immediate navigate instead of timeout |
| **LOW** | `src/components/ErrorBoundary.tsx` | 34 | Uses `window.location.href = '/'` | Acceptable for error recovery scenario |
| **LOW** | `src/components/membership/*.tsx` | Multiple | Uses `window.location.href` for Stripe checkout URL | **CORRECT** — External redirect requires full page navigation |

**Verdict:** No BLOCKER or HIGH issues. All redirects follow the centralized pattern.

---

## 3. AUTH & ROLE GUARDS ANALYSIS

### Guards Used:
1. **AdminRoute** (`src/routes.tsx:73-93`) — Protects `/admin/*` routes
2. **RequireRoles** (`src/components/auth/RequireRoles.tsx`) — Tenant-scoped role protection
3. **AthleteRouteGuard** (`src/components/auth/AthleteRouteGuard.tsx`) — Athlete portal protection
4. **TenantOnboardingGate** (`src/components/onboarding/TenantOnboardingGate.tsx`) — Onboarding enforcement

### Issues Found:

| Severity | File | Line | Issue | Recommended Fix |
|----------|------|------|-------|-----------------|
| **MEDIUM** | `src/components/onboarding/TenantOnboardingGate.tsx` | 35 | Uses type assertion `(tenant as unknown as { onboarding_completed?: boolean })` | Update tenant type definition to include `onboarding_completed` |

---

## 4. USER FLOW VALIDATION

### Flow: Unauthenticated access to private route
- **Path:** User visits `/:tenantSlug/portal`
- **Result:** AthleteRouteGuard → redirects to `/:tenantSlug/login` ✅

### Flow: Login as Superadmin
- **Path:** Login → `/portal` → PortalRouter detects `isGlobalSuperadmin` → `/admin`
- **Result:** ✅ CORRECT

### Flow: Login as Tenant Admin
- **Path:** Login → `/portal` → PortalRouter fetches admin roles → resolves billing → `/:tenantSlug/app`
- **Result:** ✅ CORRECT

### Flow: Login as Athlete
- **Path:** Login → `/portal` → PortalRouter fetches athlete data → `/:tenantSlug/portal`
- **Result:** ✅ CORRECT

### Flow: Login with no tenant context
- **Path:** Login → `/portal` → PortalRouter shows "no_context" state → offers `/join` wizard
- **Result:** ✅ CORRECT

### Flow: Logout and refresh
- **Path:** Logout → session cleared → guards redirect to `/portal` → PortalRouter → `/login`
- **Result:** ✅ CORRECT

### Flow: Deep link access
- **Path:** Unauthenticated user visits `/:tenantSlug/app/approvals`
- **Result:** RequireRoles → `/portal` → `/login` ✅

---

## 5. FORM & DOM SEMANTICS ISSUES

| Severity | File | Line | Field | Missing Attrs | Recommended Fix |
|----------|------|------|-------|---------------|-----------------|
| **MEDIUM** | `src/pages/Login.tsx` | 85-91 | `name` input | `name`, `autocomplete` | Add `name="name" autoComplete="name"` |
| **MEDIUM** | `src/pages/Login.tsx` | 100-107 | `email` input | `name`, `autocomplete` | Add `name="email" autoComplete="email"` |
| **MEDIUM** | `src/pages/Login.tsx` | 116-124 | `password` input | `name`, `autocomplete` | Add `name="password" autoComplete="current-password"` |
| **MEDIUM** | `src/pages/AthleteLogin.tsx` | 123-132 | `email` input | `name`, `autocomplete` | Add `name="email" autoComplete="email"` |
| **MEDIUM** | `src/pages/ForgotPassword.tsx` | 123-132 | `email` input | `name` | Add `name="email"` |
| **MEDIUM** | `src/pages/ResetPassword.tsx` | 227-236 | `password` input | `name` | Add `name="password"` |
| **MEDIUM** | `src/pages/ResetPassword.tsx` | 251-259 | `confirmPassword` input | `name` | Add `name="confirmPassword"` |
| **MEDIUM** | `src/pages/JoinAccount.tsx` | 179-187 | `name` input | `name`, `autocomplete` | Add `name="name" autoComplete="name"` |
| **MEDIUM** | `src/pages/JoinAccount.tsx` | 196-204 | `email` input | `name`, `autocomplete` | Add `name="email" autoComplete="email"` |
| **MEDIUM** | `src/pages/JoinAccount.tsx` | 212-220 | `password` input | `name`, `autocomplete` | Add `name="password" autoComplete="new-password"` |

---

## 6. CONSOLE & RUNTIME WARNINGS

| Severity | Source | Issue | Recommended Fix |
|----------|--------|-------|-----------------|
| **MEDIUM** | Console | `Function components cannot be given refs` in `PublicHeader.tsx` at DropdownMenu | Wrap `DropdownMenu` component or its trigger with `React.forwardRef` if custom component is passed |
| **LOW** | Console | React Router Future Flag Warning: `v7_startTransition` | Add `future={{ v7_startTransition: true }}` to BrowserRouter |

---

## 7. SUMMARY BY SEVERITY

### BLOCKER (0)
None found.

### HIGH (0)
None found.

### MEDIUM (12)
1. Form semantics: Missing `name` and `autocomplete` attributes across 5 auth forms (10 input fields)
2. Console warning: DropdownMenu ref issue in PublicHeader.tsx
3. Type assertion workaround in TenantOnboardingGate.tsx

### LOW (3)
1. ResetPassword.tsx uses setTimeout for navigation
2. React Router future flag warning
3. window.location.href usage in ErrorBoundary (acceptable)

---

## 8. RECOMMENDED FIXES

### Fix 1: Add Form Semantics (MEDIUM)
Add `name` and `autoComplete` attributes to all auth form inputs:

**Login.tsx:**
```tsx
// name input (line 85-91)
<Input name="name" autoComplete="name" ... />

// email input (line 100-107)  
<Input name="email" autoComplete="email" ... />

// password input (line 116-124)
<Input name="password" autoComplete="current-password" ... />
```

**AthleteLogin.tsx:**
```tsx
// email input (line 123-132)
<Input name="email" autoComplete="email" ... />
```

**ForgotPassword.tsx:**
```tsx
// email input (line 123-132) - already has autoComplete
<Input name="email" autoComplete="email" ... />
```

**ResetPassword.tsx:**
```tsx
// password input (line 227-236)
<Input name="password" autoComplete="new-password" ... />

// confirmPassword input (line 251-259)
<Input name="confirmPassword" autoComplete="new-password" ... />
```

**JoinAccount.tsx:**
```tsx
// name input (line 179-187)
<Input name="name" autoComplete="name" ... />

// email input (line 196-204)
<Input name="email" autoComplete="email" ... />

// password input (line 212-220)
<Input name="password" autoComplete="new-password" ... />
```

### Fix 2: PublicHeader DropdownMenu Warning (MEDIUM)
**File:** `src/components/PublicHeader.tsx`
**Issue:** DropdownMenu is receiving a ref it cannot handle

**Cause:** Likely the `Button` component passed to `DropdownMenuTrigger` uses `asChild` pattern but the actual trigger element isn't forwarding refs properly.

**Fix:** Ensure any custom component used as trigger forwards refs:
```tsx
// If using a custom component, wrap with forwardRef
const TriggerButton = React.forwardRef<HTMLButtonElement, Props>((props, ref) => (
  <button ref={ref} {...props} />
));
```

### Fix 3: Add React Router Future Flag (LOW)
**File:** `src/App.tsx`
```tsx
<BrowserRouter future={{ v7_startTransition: true }}>
  ...
</BrowserRouter>
```

---

## 9. ARCHITECTURE VERIFICATION

### ✅ Centralized Routing
- `/portal` (PortalRouter) is the ONLY decision point for post-login routing
- All guards redirect to `/portal`, never directly to destination

### ✅ Deny-by-Default
- ACCESS_MATRIX defines explicit allowed roles
- RequireRoles denies access if no matching role

### ✅ Superadmin Impersonation
- Superadmins MUST impersonate to access tenant routes
- Impersonation state is validated server-side
- TTL-based expiration with auto-cleanup

### ✅ Join Wizard Anti-Orphan
- Users cannot create accounts without selecting a tenant
- Session state persists across wizard steps with TTL

---

## 10. NO ACTION REQUIRED

The following patterns were verified as correct and require no changes:
- Login.tsx navigates to `/portal` (neutral redirect)
- AuthCallback.tsx uses pure function for redirect validation
- AthleteRouteGuard implements fail-closed policy
- TenantLayout blocks inactive tenants for `/app/*` routes
- PortalRouter uses race-safe refs to prevent double execution
- RequireRoles handles impersonation validation correctly
