# TATAME Pro — System Invariants

**SAFE GOLD v1.0 — PI-D6.2.1**

This document defines the canonical invariants of the TATAME Pro system.
All invariants are enforced at the database, edge function, or RLS layer.
Frontend guards are defense-in-depth only.

---

## I1. Document Validity (Golden Rule)

A document is **VALID** if and only if **ALL** conditions are true:

```text
1. tenant.lifecycle_status === 'ACTIVE'
2. billing.status ∈ ['ACTIVE', 'TRIALING']
3. document.status ∈ ['ACTIVE', 'ISSUED']
4. document.revoked_at === null
```

**Enforcement:**
- `isInstitutionalDocumentValid()` — Shared utility (frontend + edge functions)
- `public.is_institutional_document_valid()` — Database function
- `verify-document` / `verify-digital-card` — Public verification endpoints

**Files:**
- `src/lib/institutional/isDocumentValid.ts`
- `supabase/functions/_shared/isDocumentValid.ts`

---

## I2. Federation Governance

1. **Federation never exists without governance:**
   - Creation MUST create at least one `federation_roles` entry
   - Creator gets `FED_ADMIN` role by default

2. **Tenant↔Federation link is immutable (soft history):**
   - `federation_tenants.left_at` tracks departure (never DELETE)
   - Current state = derived from history

3. **Federative events require `metadata.federation_id`:**
   - `FEDERATION_CREATED`, `FEDERATION_STATUS_CHANGED`
   - `TENANT_JOINED_FEDERATION`, `TENANT_LEFT_FEDERATION`
   - `FEDERATION_ROLE_ASSIGNED`, `FEDERATION_ROLE_REVOKED`

**Enforcement:**
- `createAuditLog()` — Validates mandatory fields
- `join-federation` / `leave-federation` — Dedicated edge functions

---

## I3. Audit Trail

1. **`audit_logs` is append-only:**
   - No DELETE policies
   - No UPDATE policies (immutable)
   - RLS: read-only for tenant admins

2. **Institutional actions require audit:**
   - Document issuance/revocation
   - Tenant status changes
   - Role grants/revocations
   - Federation operations

3. **Federation events require identifiers:**
   - `FEDERATION_*` → `metadata.federation_id`
   - `COUNCIL_*` → `metadata.federation_id` AND `metadata.council_id`

**Enforcement:**
- RLS on `audit_logs` — INSERT only, no UPDATE/DELETE
- `createAuditLog()` — Validates mandatory fields per event type

---

## I4. Tenant Lifecycle

| Status | Description | Document Emission | Critical Operations |
|--------|-------------|-------------------|---------------------|
| `SETUP` | Onboarding in progress | ❌ Blocked | ❌ Blocked |
| `ACTIVE` | Operational | ✅ Allowed (if billing OK) | ✅ Allowed |
| `BLOCKED` | Suspended | ❌ Blocked | ❌ Blocked |

**Transitions:**
- `SETUP → ACTIVE`: Atomic via `complete-tenant-onboarding`
- `ACTIVE → BLOCKED`: Admin action or billing failure
- `BLOCKED → ACTIVE`: Admin action only

**Enforcement:**
- `requireTenantActive()` — Shared utility for edge functions
- `TenantOnboardingGate` — Frontend redirect for SETUP tenants

**Files:**
- `supabase/functions/_shared/requireTenantActive.ts`
- `src/components/tenant/TenantOnboardingGate.tsx`

---

## I5. RLS Independence

1. **Security never depends on frontend:**
   - All sensitive operations validated at edge function or RLS
   - Frontend guards are UX, not security

2. **Guards are defense-in-depth:**
   - Multiple layers: RLS → Edge Function → Frontend
   - Any layer can block; none can bypass

3. **RLS on all sensitive tables:**
   - `tenants`, `profiles`, `user_roles`
   - `memberships`, `athletes`, `academies`
   - `tenant_billing`, `audit_logs`
   - `digital_cards`, `diplomas`

**Enforcement:**
- RLS policies with `auth.uid()` checks
- Edge functions with `requireTenantRole()` / `requireBillingStatus()`

---

## I6. Error Neutrality (Public Endpoints)

1. **HTTP 200 always for public endpoints:**
   - `verify-document`, `verify-digital-card`
   - Never 401, 403, 404 for public verification

2. **Single neutral message for any failure:**
   - Token invalid → `{ valid: false, status_label: "NOT_FOUND" }`
   - Document revoked → `{ valid: false, status_label: "NOT_FOUND" }`
   - Tenant blocked → `{ valid: false, status_label: "NOT_FOUND" }`

3. **Zero semantic leakage:**
   - User never learns WHY verification failed
   - Only learns IF document is valid or not

**Enforcement:**
- All public endpoints return HTTP 200
- Standardized `VerifyResponse` type

---

## I7. Billing Guard

1. **Critical operations require billing check:**
   - `requireBillingStatus()` before document emission
   - `requireBillingStatus()` before membership approval

2. **Allowed statuses:**
   - `ACTIVE` — Full access
   - `TRIALING` — Full access (trial period)

3. **Blocked statuses:**
   - `PAST_DUE`, `CANCELLED`, `INCOMPLETE`, etc.

**Enforcement:**
- `requireBillingStatus()` — Shared utility
- Golden Rule includes billing status

---

## I8. Impersonation

1. **Only SUPERADMIN_GLOBAL can impersonate:**
   - Role with `tenant_id IS NULL`

2. **Sessions are time-limited:**
   - Max 60 minutes TTL
   - One active session per superadmin

3. **All impersonation is audited:**
   - `IMPERSONATION_STARTED`
   - `IMPERSONATION_ENDED`
   - `IMPERSONATION_EXPIRED`

**Enforcement:**
- `start-impersonation` — Creates session
- `requireImpersonationIfSuperadmin()` — Validates during operations

---

## Violation Response

Any invariant violation MUST result in:

1. **Block** — Operation is prevented
2. **Audit** — Event logged with context
3. **Neutral Error** — No semantic information leaked

---

---

## Test Coverage

Each invariant is validated by contract tests in `e2e/contract/`:

| Invariant | Test File | Test IDs |
|-----------|-----------|----------|
| I1. Document Validity | `safe-gold-invariants.spec.ts` | C.3.x |
| I2. Federation Governance | `federation-lifecycle.spec.ts` | FG.C.1-9 |
| I3. Audit Trail | `federation-lifecycle.spec.ts` | FG.C.4, FG.C.7 |
| I4. Tenant Lifecycle | `tenant-lifecycle-guard.spec.ts` | TG.C.1-7 |
| I5. RLS Independence | `safe-gold-invariants.spec.ts` | C.3.1, C.3.3 |
| I6. Error Neutrality | `tenant-lifecycle-guard.spec.ts` | TG.C.7 |
| I7. Billing Guard | `billing-contract.spec.ts` | B.C.x |
| I8. Impersonation | `impersonation-contract.spec.ts` | I.C.x |

**Policy:** All invariants MUST have corresponding contract tests.

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-08 | PI-D6.2.1 | Initial canonical invariants |
| 1.1 | 2026-02-08 | PI-D6.1 | Added Test Coverage matrix |

---

**SAFE GOLD**: Sistema blindado com invariantes explícitas e executáveis.
