# Navigation Contract — TATAME Pro

> **Version:** 1.0.0  
> **Status:** FROZEN  
> **PI:** E1 — Contrato de Navegação Autorizada  
> **SAFE GOLD:** ✅  

## Principles

1. Navigation is an **institutional contract**, not a frontend detail.
2. Routes are **semantic domains**, not permissions.
3. Persona precedes implementation.
4. **If it's not in the contract, it's forbidden.**

---

## Canonical Personas

| Persona | Description |
|---------|-------------|
| `SUPERADMIN_GLOBAL` | Governance, health, audit, systemic vision |
| `ADMIN_TENANT` | Administrative operation of a single organization |
| `ATHLETE` | Individual sports trajectory |
| `PUBLIC` | Verification and public read-only access |

---

## Route × Persona Map

### 1️⃣ Institutional Domain (Global)

| Route | Persona | Guard |
|-------|---------|-------|
| `/admin` | `SUPERADMIN_GLOBAL` | `requireSuperAdmin()` |
| `/admin/health` | `SUPERADMIN_GLOBAL` | `requireSuperAdmin()` |
| `/admin/audit` | `SUPERADMIN_GLOBAL` | `requireSuperAdmin()` |
| `/admin/diagnostics` | `SUPERADMIN_GLOBAL` | `requireSuperAdmin()` |
| `/admin/landing` | `SUPERADMIN_GLOBAL` | `requireSuperAdmin()` |
| `/admin/tenants/:tenantId/control` | `SUPERADMIN_GLOBAL` | `requireSuperAdmin()` |

- ❌ No `ADMIN_TENANT` or `ATHLETE` access
- ❌ Never requires impersonation

### 2️⃣ Organizational Domain (Tenant)

| Route | Persona | Guard |
|-------|---------|-------|
| `/:tenantSlug/app` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/me` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/athletes` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/athletes/:id/gradings` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/memberships` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/memberships/:id` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/academies` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/coaches` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/grading-schemes` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/grading-schemes/:id/levels` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/approvals` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/approvals/:id` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/rankings` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/events` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` + `BillingGate` |
| `/:tenantSlug/app/events/:id` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` + `BillingGate` |
| `/:tenantSlug/app/audit-log` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/security` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/billing` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/settings` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |
| `/:tenantSlug/app/onboarding` | `ADMIN_TENANT` | `requireTenantAdmin()` |
| `/:tenantSlug/app/diagnostics` | `ADMIN_TENANT` | `requireTenantAdmin()` |
| `/:tenantSlug/app/help` | `ADMIN_TENANT` | `requireTenantAdmin()` + `RequireFeature` |

- ✔ Always under tenant context
- ✔ SUPERADMIN requires explicit impersonation to access

### 3️⃣ Athlete Domain

| Route | Persona | Guard |
|-------|---------|-------|
| `/:tenantSlug/portal` | `ATHLETE` | `requireAthlete()` |
| `/:tenantSlug/portal/card` | `ATHLETE` | `requireAthlete()` |
| `/:tenantSlug/portal/events` | `ATHLETE` | `requireAthlete()` |
| `/portal/*` | `ATHLETE` | `requireAuthenticated()` → PortalRouter |

- ✔ No administrative context
- ✔ No institutional actions

### 4️⃣ Public Domain

| Route | Persona | Guard |
|-------|---------|-------|
| `/` | `PUBLIC` | none |
| `/login` | `PUBLIC` | none |
| `/signup` | `PUBLIC` | none |
| `/help` | `PUBLIC` | none |
| `/about` | `PUBLIC` | none |
| `/forgot-password` | `PUBLIC` | none |
| `/reset-password` | `PUBLIC` | none |
| `/auth/callback` | `PUBLIC` | none |
| `/verify/:token` | `PUBLIC` | none |
| `/identity/wizard` | `PUBLIC` | `requireAuthenticated()` |
| `/:tenantSlug` | `PUBLIC` | none (tenant landing) |
| `/:tenantSlug/login` | `PUBLIC` | none |
| `/:tenantSlug/membership/*` | `PUBLIC` | none |
| `/:tenantSlug/verify/*` | `PUBLIC` | none |
| `/:tenantSlug/academies` | `PUBLIC` | none |
| `/:tenantSlug/rankings` | `PUBLIC` | none |
| `/:tenantSlug/events` | `PUBLIC` | none |
| `/:tenantSlug/events/:eventId` | `PUBLIC` | none |

- ✔ Read-only
- ✔ Zero authentication required (except identity/wizard)

### 5️⃣ Federation Domain

| Route | Persona | Guard |
|-------|---------|-------|
| `/federation/:slug/dashboard` | `FEDERATION_ADMIN` | `requireFederationRole()` |

---

## Canonical Guards

| Guard | Responsibility |
|-------|---------------|
| `requireSuperAdmin()` | Blocks any tenant context; SUPERADMIN_GLOBAL only |
| `requireTenantAdmin()` | Requires valid ADMIN_TENANT role within tenant |
| `requireAthlete()` | Requires athlete binding |
| `requireAuthenticated()` | Session exists |
| `ImpersonationGate` | Never automatic; always explicit |
| `RequireFeature` | Backend feature_access contract (fail-closed) |
| `BillingGate` | Billing status enforcement |

---

## Golden Rule

> **SUPERADMIN does NOT inherit tenant access without explicit impersonation.**

---

## Formal Prohibitions

1. ❌ Creating a route without declaring it in this contract
2. ❌ Accessing `/admin/*` via impersonation
3. ❌ Using badges or flags as navigation criteria
4. ❌ Using `pathname.includes()` for access decisions
5. ❌ Any route not listed here is **denied by default**

---

## Valid Examples

| Scenario | Result |
|----------|--------|
| SUPERADMIN accesses `/admin/health` | ✅ Allowed |
| SUPERADMIN accesses `/:slug/app` without impersonation | ❌ Blocked |
| SUPERADMIN impersonates → accesses `/:slug/app` | ✅ Allowed |
| ADMIN_TENANT accesses `/admin` | ❌ Blocked |
| ATHLETE accesses `/:slug/portal` | ✅ Allowed |
| ATHLETE accesses `/:slug/app` | ❌ Blocked |
| PUBLIC accesses `/verify/:token` | ✅ Allowed |
| PUBLIC accesses `/admin` | ❌ Blocked |

---

## Federation Domain (Declared / Inactive)

> **PI E1.1 — Status: FROZEN**

The Federation Domain is institutionally declared but **NOT active**.

### Current Status
- ❌ No active routes
- ❌ No UI
- ❌ No data model in use
- ❌ No guards
- ❌ No permissions
- ❌ No implicit access

### Rule of Enforcement
Any attempt to create, access, or expose federation-related routes, components,
or permissions **WITHOUT an explicit activation PI** is forbidden.

Activation requires:
- New PI with explicit scope definition
- Guard contracts
- Observability & audit alignment
- Governance approval

### Hard Rules
1. ❌ No `/federation/*` route may exist in production
2. ❌ No `requireFederation*` guard may be implemented
3. ❌ No `FEDERATION_ADMIN` persona may be activated
4. ❌ No federation UI may be rendered
5. ❌ No indirect access via SUPERADMIN or TENANT is permitted

---

## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-02-10 | Initial contract (PI E1) — FROZEN |
| 1.1.0 | 2026-02-10 | Federation Domain declared & inactive (PI E1.1) — FROZEN |
