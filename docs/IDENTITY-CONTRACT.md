# 🔐 IDENTITY CONTRACT — Backend-Driven Wizard Flow

**Version:** 2.0.0  
**Last Updated:** 2026-01-27  
**Status:** ✅ IMPLEMENTED (F0.1 Refactored)

## Purpose

This document defines the **Identity Contract** that ensures every authenticated user has a resolved tenant before accessing any protected area of the system. **All sensitive operations happen exclusively on the backend.**

## Core Principles (Non-Negotiable)

1. **Authenticated user without tenant = INVALID STATE**
2. **No protected route accessible without resolved tenant**
3. **All identity flows end in: explicit success OR explicit error (blocking)**
4. **No silent redirects**
5. **Client NEVER writes to: user_roles, tenant_billing, identity decisions**
6. **Single source of truth: Edge Function**

---

## Architecture

### Components

| Component | Purpose |
|-----------|---------|
| `resolve-identity-wizard` | Edge Function - ALL identity resolution & writes |
| `IdentityContext` | Consumes state ONLY (no direct queries) |
| `IdentityGuard` | Global enforcement, redirects to wizard |
| `IdentityWizard` | UI for onboarding, calls Edge Function |
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

### Edge Function API

#### CHECK Action (Read-Only)

```typescript
// Request
{ action: "CHECK" }

// Response
{
  status: "RESOLVED" | "WIZARD_REQUIRED" | "ERROR",
  tenant?: { id: string, slug: string, name: string },
  role?: "ADMIN_TENANT" | "ATHLETE" | "SUPERADMIN_GLOBAL",
  redirectPath?: string,
  error?: { code: string, message: string }
}
```

#### COMPLETE_WIZARD Action (Write)

```typescript
// Request
{
  action: "COMPLETE_WIZARD",
  payload: {
    joinMode: "existing" | "new",
    inviteCode?: string,      // Required if joinMode = "existing"
    newOrgName?: string,      // Required if joinMode = "new"
    profileType: "admin" | "athlete"
  }
}

// Response - same as CHECK
```

### Backend Responsibilities (Edge Function ONLY)

- ✅ Validate JWT
- ✅ Resolve identity from profiles/roles/athletes
- ✅ Create tenant (if new)
- ✅ Create billing record (trial)
- ✅ Create user_roles
- ✅ Mark wizard_completed = true
- ✅ Return deterministic state

### Client Responsibilities (IdentityContext)

- ✅ Call Edge Function for CHECK
- ✅ Store: identityState, tenant, role, redirectPath
- ✅ Call Edge Function for COMPLETE_WIZARD
- ❌ NO direct queries to profiles/roles/athletes for identity
- ❌ NO writes to sensitive tables
- ❌ NO auto-healing logic
- ❌ NO tenant enumeration (search)

---

## Security Blocks

### Absolute Prohibitions

| ❌ Prohibited | Why |
|---------------|-----|
| Client writing to `user_roles` | Privilege escalation risk |
| Client creating `tenant_billing` | Bypass payment risk |
| Open search on `tenants` (ilike) | Tenant enumeration attack |
| Auto-complete wizard | Silent state changes |
| Direct identity logic in client | Scattered, inconsistent |

### Allowed Client Operations

| ✅ Allowed |
|------------|
| Call Edge Function with JWT |
| Read-only display of returned state |
| Navigate based on redirectPath |

---

## Mandatory Flows

### 1️⃣ CHECK (Login / Refresh)

```
Edge Function:
├── Verify JWT
├── Check superadmin role → RESOLVED (superadmin)
├── Check wizard_completed
│   ├── FALSE → Check existing context
│   │   ├── Has context → Auto-complete, RESOLVED
│   │   └── No context → WIZARD_REQUIRED
│   └── TRUE → Resolve tenant → RESOLVED
└── Return deterministic state
```

### 2️⃣ COMPLETE_WIZARD

```
Edge Function:
├── Validate payload
├── If joinMode = "new":
│   ├── Generate slug
│   ├── Check availability (exact match)
│   ├── Create tenant
│   ├── Create billing (TRIALING)
│   └── Create role (ADMIN_TENANT)
├── If joinMode = "existing":
│   ├── Validate invite code (exact match, no enumeration)
│   └── Create role (if admin)
├── Update profile: wizard_completed = true, tenant_id
└── Return RESOLVED + redirectPath
```

---

## Blocking Errors (With Message)

All errors display on `IdentityErrorScreen`:

| Error Code | Title | Description |
|------------|-------|-------------|
| `TENANT_NOT_FOUND` | Organization not found | Tenant doesn't exist or was deactivated |
| `INVITE_INVALID` | Invalid invite | Code expired, invalid, or not found |
| `PERMISSION_DENIED` | Access denied | User lacks required permissions |
| `SLUG_TAKEN` | Name already in use | Organization name is taken |
| `VALIDATION_ERROR` | Invalid data | Missing or malformed fields |
| `UNKNOWN` | Identity error | Generic fallback with retry |

⚠️ **No silent errors. No console-only logging.**

---

## Acceptance Criteria (QA)

- [ ] No logged-in user outside of tenant
- [ ] No "lost" athlete
- [ ] Signup never leads to limbo
- [ ] Refresh doesn't break the wizard
- [ ] Deep link without tenant redirects correctly
- [ ] **No client writes to user_roles**
- [ ] **No client writes to tenant_billing**
- [ ] **No tenant enumeration via search**

---

## What Cannot Change

- ❌ Signup model
- ❌ Blocking rules
- ❌ Valid/invalid states
- ❌ No "temporary" shortcuts
- ❌ Backend as single source of truth

---

## Expected Result

✅ **Limbo eliminated**  
✅ **Predictable flow**  
✅ **Real security (backend-enforced)**  
✅ **Clean architecture**  
✅ **Solid base for F0.2, billing, permissions, scale**

---

*This document is part of the TATAME PRO security and identity baseline.*
