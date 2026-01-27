# 🔐 IDENTITY CONTRACT — Blocking Wizard Flow

**Version:** 1.0.0  
**Last Updated:** 2026-01-27  
**Status:** ✅ IMPLEMENTED

## Purpose

This document defines the **Identity Contract** that ensures every authenticated user has a resolved tenant before accessing any protected area of the system.

## Core Principles (Non-Negotiable)

1. **Authenticated user without tenant = INVALID STATE**
2. **No protected route accessible without resolved tenant**
3. **All identity flows end in: explicit success OR explicit error (blocking)**
4. **No silent redirects**

---

## Architecture

### Components

| Component | Purpose |
|-----------|---------|
| `IdentityContext` | State machine for identity resolution |
| `IdentityGuard` | Global enforcement, redirects to wizard |
| `IdentityWizard` | 3-step blocking onboarding |
| `IdentityErrorScreen` | Explicit error display |

### Identity States

```typescript
type IdentityState = 
  | 'loading'           // Checking identity status
  | 'wizard_required'   // Must complete wizard (BLOCKING)
  | 'resolved'          // Tenant resolved, access granted
  | 'superadmin'        // Global superadmin, no tenant required
  | 'error';            // Error state (with explicit message)
```

### Database

| Column | Type | Purpose |
|--------|------|---------|
| `profiles.wizard_completed` | `BOOLEAN` | `FALSE/NULL` = blocking, `TRUE` = resolved |
| `profiles.tenant_id` | `UUID` | Resolved tenant context |

---

## Mandatory Flows

### 1️⃣ LOGIN (Any Profile)

```
After authentication:
├── Resolve tenants linked to user
├── Evaluate states:
│   ├── wizard_completed = FALSE → Wizard
│   ├── wizard_completed = TRUE, has context → resolved
│   └── superadmin → bypass wizard
└── No fallback, no partial access
```

### 2️⃣ SIGNUP (New User)

```
After account creation:
├── wizard_completed = FALSE (default)
├── NEVER direct to /portal or /app
└── ALWAYS go to Wizard (/identity/wizard)
```

---

## Wizard Steps

### Step 1 — Organization Binding (Mandatory)

**Question:** "Are you already part of an organization?"

| Option | Action |
|--------|--------|
| YES | Enter code/invite → Validate tenant |
| NO | Create new organization → User becomes Admin |

⚠️ **Cannot advance without resolving tenant.**

### Step 2 — Profile Type (Mandatory)

| Option | Role Granted |
|--------|--------------|
| Admin/Manager | `ADMIN_TENANT` |
| Athlete | No role (goes to membership flow) |

### Step 3 — Completion

Only completes if:
- ✅ Tenant created or associated
- ✅ Role defined
- ✅ Profile valid

After completion:
- `wizard_completed = TRUE`
- Secure redirect to appropriate area

---

## Technical Blocks (Mandatory)

### IdentityGuard (Global Middleware)

```typescript
// Bypassed routes (no identity check):
const BYPASS_ROUTES = [
  '/login', '/forgot-password', '/reset-password',
  '/help', '/auth/callback', '/identity/wizard', '/'
];

// Public tenant patterns (no identity check):
const PUBLIC_TENANT_PATTERNS = [
  /^\/[^/]+\/verify\//,
  /^\/[^/]+\/membership\/new$/,
  /^\/[^/]+\/academies$/,
  // ... etc
];
```

### PortalRouter Integration

```typescript
// Rule 2: Wizard not complete → /identity/wizard (BLOCKING)
if (identityState === 'wizard_required' || !wizardCompleted) {
  navigate("/identity/wizard", { replace: true });
}
```

---

## Blocking Errors (With Message)

All errors display on `IdentityErrorScreen`:

| Error Code | Title | Description |
|------------|-------|-------------|
| `TENANT_NOT_FOUND` | Organization not found | Tenant doesn't exist or was deactivated |
| `INVITE_INVALID` | Invalid invite | Code expired, invalid, or already used |
| `PERMISSION_DENIED` | Access denied | User lacks required permissions |
| `IMPERSONATION_INVALID` | Invalid impersonation session | Impersonation expired |
| `UNKNOWN` | Identity error | Generic fallback with retry |

⚠️ **No silent errors. No console-only logging.**

---

## Acceptance Criteria (QA)

- [ ] No logged-in user outside of tenant
- [ ] No "lost" athlete
- [ ] Signup never leads to limbo
- [ ] Refresh doesn't break the wizard
- [ ] Deep link without tenant redirects correctly

---

## What Cannot Change

- ❌ Signup model
- ❌ Blocking rules
- ❌ Valid/invalid states
- ❌ No "temporary" shortcuts

---

## Expected Result

✅ **Limbo eliminated**  
✅ **Predictable flow**  
✅ **Solid base for billing, permissions, and scale**

---

*This document is part of the TATAME PRO security and identity baseline.*
