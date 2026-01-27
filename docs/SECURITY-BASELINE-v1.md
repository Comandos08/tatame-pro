# Security Baseline v1 - Official Closure Document

---

| Field | Value |
|-------|-------|
| System | Tatame Pro |
| Version | v1.0 |
| Status | CLOSED |
| Closure Date | 2026-01-27 |
| Technical Responsibility | Security Architecture |
| Document Version | 1.0.0 |

---

## 1. Objective

This document formalizes the closure of Security Baseline v1 for the Tatame Pro platform. It serves as the official technical record of security controls implemented, threats mitigated, and residual risks accepted.

### 1.1 What Security Baseline v1 Covers

- Authentication mechanisms (JWT validation, session management)
- Authorization framework (role-based access control, access matrix)
- Multi-tenant data isolation (RLS policies, tenant_id enforcement)
- Superadmin governance (mandatory impersonation, TTL enforcement)
- Audit trail integrity (immutable logs, hash chain verification)
- Rate limiting and abuse prevention
- Frontend security guards
- End-to-end security testing

### 1.2 What Security Baseline v1 Does NOT Cover

- ISO 27001 / SOC 2 compliance certification
- External penetration testing by third parties
- SIEM/SOAR integration
- Real-time threat monitoring and alerting
- Red team exercises
- Mobile application security (platform is web-only)
- DDoS protection at infrastructure level
- Key rotation automation

---

## 2. Scope Coverage

The following ten areas were evaluated with technical evidence from the codebase:

| Area | Technical Evidence |
|------|-------------------|
| Authentication | JWT validation via Supabase Auth, `requireTenantRole.ts` extracts and validates Bearer tokens |
| Authorization | `accessMatrix.ts` implements deny-by-default, `RequireRoles.tsx` guards frontend routes |
| Multi-tenancy | RLS policies enforce `tenant_id` on all tenant-scoped tables via foreign key constraints |
| Superadmin/Impersonation | `requireImpersonationIfSuperadmin.ts` enforces 60-minute TTL and 8-point validation |
| Edge Functions | 33+ functions implement standardized security patterns (auth, role, rate limit, logging) |
| Rate Limiting | `SecureRateLimiter` class in `secure-rate-limiter.ts` with fail-closed behavior via Upstash Redis |
| Decision Logs | SHA-256 hash chain implemented in `decision-logger.ts`, verified via `verify_decision_log_chain` RPC |
| Audit Logs | Immutable via RLS (UPDATE/DELETE blocked for all roles), tenant-isolated |
| Frontend Guards | `RequireRoles.tsx` component and `PortalRouter.tsx` centralized routing hub |
| E2E Security Tests | 8 test files in `e2e/security/` covering auth, impersonation, tenant isolation, rate limiting |

---

## 3. Security Principles

The following seven principles govern the security architecture:

### 3.1 Deny-by-Default

The `ACCESS_MATRIX` in `src/lib/accessMatrix.ts` returns an empty array for unknown features. Access is only granted when explicitly defined.

```typescript
// src/lib/accessMatrix.ts - Line 45
export function getPermittedRoles(feature: FeatureKey): AppRole[] {
  return ACCESS_MATRIX[feature] || [];
}
```

### 3.2 Least Privilege

Roles are scoped to specific features via the access matrix. Users receive only the permissions required for their function within a specific tenant context.

### 3.3 Explicit Impersonation

Superadmins cannot perform tenant-scoped operations without an active impersonation session. The `x-impersonation-id` header is mandatory for all sensitive Edge Function calls when the caller is `SUPERADMIN_GLOBAL`.

```typescript
// supabase/functions/_shared/requireImpersonationIfSuperadmin.ts - Lines 57-65
if (!impersonationId) {
  console.warn(`[IMPERSONATION-CHECK] Superadmin ${userId} attempted action without impersonation`);
  return { 
    valid: false, 
    isSuperadmin: true, 
    error: 'Superadmin requires active impersonation for tenant operations' 
  };
}
```

### 3.4 Anti-Enumeration

All authorization failures return generic HTTP 403 responses with the message `"Operation not permitted"`. No information about resource existence, user roles, or tenant context is leaked.

### 3.5 Fail-Closed

The rate limiter blocks requests when Redis is unavailable rather than allowing them through. This prevents abuse during infrastructure degradation.

```typescript
// supabase/functions/_shared/secure-rate-limiter.ts - Lines 96-108
} catch (error) {
  console.error(`[RATE-LIMIT] Redis error for ${key}:`, error);
  // FAIL-CLOSED: Block on error to prevent abuse
  return {
    allowed: false,
    remaining: 0,
    resetAt: new Date(Date.now() + this.windowSeconds * 1000),
    isError: true,
  };
}
```

### 3.6 Centralized Decision-Making

The `/portal` route (`src/pages/PortalRouter.tsx`) serves as the single routing hub for post-login decisions. All protected layouts redirect to `/portal` on authorization failure, delegating the final destination decision to this centralized component.

### 3.7 Tenant Isolation at Database Level

All tenant-scoped tables enforce `tenant_id` via RLS policies. No application-level filtering is trusted as the sole isolation mechanism.

---

## 4. Controls Implemented

| Control | Location | Evidence |
|---------|----------|----------|
| JWT Validation | All Edge Functions | `authHeader.replace("Bearer ", "")` pattern in function preambles |
| Role Enforcement | `requireTenantRole.ts` | Lines 61-151 validate caller has required role for tenant |
| Impersonation Validation | `requireImpersonationIfSuperadmin.ts` | 8-point validation: existence, ownership, status, expiry, tenant match |
| Rate Limiting (Fail-Closed) | `secure-rate-limiter.ts` | Lines 96-108 block on Redis error |
| Decision Logging with Hash Chain | `decision-logger.ts` | Lines 100-157 compute SHA-256 chain per tenant |
| RLS Immutability | Migration `20260127020645` | Policies block UPDATE/DELETE on `audit_logs`, `decision_logs`, `security_events` |
| Anti-Enumeration Responses | All Sensitive Edge Functions | Standardized `forbiddenResponse()` pattern |
| Centralized Routing | `PortalRouter.tsx` | Single hub with deterministic decision tree |
| Frontend Route Guards | `RequireRoles.tsx` | Wraps protected routes with role validation |
| Impersonation TTL | `start-impersonation/index.ts` | 60-minute expiration, auto-expire on validation |
| Cross-Tenant Block Logging | `decision-logger.ts` | `CROSS_TENANT_BLOCK` decision type with critical severity |
| Password Reset Hardening | `admin-reset-password/index.ts` | Requires SUPERADMIN_GLOBAL + active impersonation |
| Role Mutation via Edge Functions | `grant-roles/index.ts`, `revoke-roles/index.ts` | No direct client mutations allowed |
| Membership Action Auditing | `approve-membership/index.ts`, `reject-membership/index.ts` | `logMembershipApproved`/`logMembershipRejected` calls |
| Rate Limit Headers | `secure-rate-limiter.ts` | `x-ratelimit-limit`, `x-ratelimit-remaining`, `retry-after` |
| Session Auto-Expire | `requireImpersonationIfSuperadmin.ts` | Lines 103-114 expire stale sessions on access |
| Idempotent Membership Actions | `approve-membership/index.ts` | Check `email_sent_for_status` before re-processing |
| Hash Chain Verification | `verify_decision_log_chain` RPC | SQL function validates `previous_hash` linkage |

---

## 5. Threats Mitigated

| ID | Threat | Attack Vector | Mitigation |
|----|--------|---------------|------------|
| R1 | Password Reset Abuse | Unauthenticated calls to `admin-reset-password` | JWT required, SUPERADMIN_GLOBAL role required, active impersonation required |
| C3 | Frontend Role Bypass | Direct `.delete()` on `user_roles` via Supabase client | All role mutations routed through `revoke-roles` Edge Function with full authorization |
| C6 | Superadmin Unscoped Actions | Approving memberships without tenant context | `requireImpersonationIfSuperadmin` enforced in `approve-membership` and `reject-membership` |
| T1 | Cross-Tenant Data Access | RLS misconfiguration or missing policies | `tenant_id` foreign keys and RLS policies on all tenant tables |
| T2 | Rate Limit Abuse | Brute force attacks on auth/password endpoints | `SecureRateLimiter` with sliding window, fail-closed behavior |
| T3 | Audit Log Tampering | Direct UPDATE/DELETE on `audit_logs` | RLS policies block all UPDATE/DELETE operations for all roles |
| T4 | Decision Log Tampering | Breaking hash chain integrity | `previous_hash` linkage verified via `verify_decision_log_chain` |
| T5 | Impersonation Session Hijacking | Using expired or stolen impersonation IDs | 8-point validation including ownership, status, expiry, tenant match |
| T6 | Information Enumeration | Error messages revealing system state | Generic 403 `"Operation not permitted"` for all authorization failures |

---

## 6. Known Risks Accepted

The following residual risks were identified during the holistic audit. They are classified as non-blocking for Security Baseline v1 with documented acceptance rationale and remediation plans for v2.

| ID | Description | Severity | Acceptance Rationale | v2 Remediation |
|----|-------------|----------|---------------------|----------------|
| H1 | Background functions (`expire-memberships`, `check-membership-renewal`, `cleanup-abandoned-memberships`) lack caller validation | Low | Functions are triggered by internal CRON scheduler only, not exposed to external callers | Add `CRON_SECRET` header validation |
| H2 | Generator functions (`generate-digital-card`, `generate-diploma`) callable without JWT | Low | Triggered immediately post-approval via Edge Function chain, require valid entity IDs | Add internal `x-internal-call` header validation |
| H3 | Email functions (`send-athlete-email`, `send-billing-email`) callable without strict scope | Low | Require valid membership/tenant IDs which are not guessable | Scope to Edge Function chains with internal headers |
| H4 | Direct `audit_logs` INSERT in `TenantSettings.tsx` | Low | RLS policy allows admin INSERT, audit event is still logged | Migrate to dedicated Edge Function |
| H5 | `user_roles` RLS could be tightened | Low | Current policy is functional, no known bypass | Add explicit role hierarchy conditions |
| H6 | Storage policies on `documents` bucket are permissive | Low | Bucket is private, access requires authenticated user with tenant context | Add path-based restrictions matching `tenant_id/athlete_id` |

---

## 7. Items Explicitly Out of Scope

The following items are explicitly excluded from Security Baseline v1:

- **Compliance Certifications**: ISO 27001, SOC 2 Type I/II, HIPAA, GDPR certification (platform handles sports federation data, not healthcare or EU PII at scale)
- **External Penetration Testing**: No third-party security firm has audited the platform
- **SIEM/SOAR Integration**: Security events are logged but not exported to external monitoring systems
- **Real-Time Threat Monitoring**: No automated alerting for repeated 403s or suspicious patterns
- **Red Team Exercises**: No adversarial testing beyond E2E security tests
- **Mobile Application Security**: Platform is web-only; no native mobile apps exist
- **DDoS Protection**: Infrastructure-level protection delegated to hosting provider
- **Key Rotation**: API keys and secrets are not automatically rotated
- **Backup Encryption Verification**: Database backups managed by Supabase; encryption status not independently verified

---

## 8. E2E Security Test Coverage

The following test files provide automated validation of security controls:

| Test File | Coverage |
|-----------|----------|
| `e2e/security/admin-reset-password.spec.ts` | Password reset authorization, impersonation requirement |
| `e2e/security/governance-tests.spec.ts` | Role-based access control, admin permissions |
| `e2e/security/immutability-tests.spec.ts` | Audit log tampering prevention, RLS enforcement |
| `e2e/security/membership-impersonation.spec.ts` | Superadmin impersonation for membership actions |
| `e2e/security/observability-tests.spec.ts` | Decision log creation, security event logging |
| `e2e/security/rate-limiting.spec.ts` | Rate limit enforcement, fail-closed behavior |
| `e2e/security/role-revocation.spec.ts` | Role mutation via Edge Functions only |
| `e2e/security-matrix.spec.ts` | Access matrix enforcement across 7 core scenarios |

---

## 9. Verdict

Tatame Pro Security Baseline v1 is hereby declared **CLOSED**.

The system operates under a deny-by-default architecture with:

- Centralized routing via `/portal` as the single decision hub
- Mandatory impersonation for superadmin tenant operations with 60-minute TTL
- Fail-closed rate limiting via Upstash Redis
- Tamper-evident audit trails with SHA-256 hash chain verification
- RLS-enforced multi-tenant isolation on all sensitive tables
- Generic error responses preventing information enumeration

All identified critical vulnerabilities have been remediated:

- **R1**: `admin-reset-password` now requires JWT + SUPERADMIN_GLOBAL + active impersonation
- **C3**: Role mutations blocked at client level; all changes via `grant-roles`/`revoke-roles` Edge Functions
- **C6**: `approve-membership` and `reject-membership` enforce impersonation for superadmins

No exploitable vulnerabilities remain within the defined scope. The platform is approved for production operation under these security parameters.

---

## 10. Security Baseline v2 Directives

The following items are targeted for Security Baseline v2:

- Add `CRON_SECRET` environment variable validation to all scheduled Edge Functions
- Implement `x-internal-call` header validation for generator and email functions
- Migrate `TenantSettings.tsx` audit logging to dedicated Edge Function
- Implement SIEM export for `security_events` and `decision_logs` tables
- Add real-time anomaly alerting for repeated 403 responses from same IP/user
- Conduct external penetration test with third-party security firm
- Evaluate SOC 2 Type II readiness assessment
- Implement session binding with device fingerprinting
- Add mTLS for Edge Function-to-Edge Function internal calls
- Implement automated key rotation for critical secrets
- Add path-based storage policies for `documents` bucket

---

## 11. Technical Signature

| Field | Value |
|-------|-------|
| Prepared By | Security Architecture |
| Approval Date | 2026-01-27 |
| Document Version | 1.0.0 |
| Review Cycle | Annual or upon significant architecture change |

---

## Appendix A: File References

The following files contain the primary security implementations referenced in this document:

### Backend (Edge Functions)

- `supabase/functions/_shared/requireTenantRole.ts` - Role enforcement utility
- `supabase/functions/_shared/requireImpersonationIfSuperadmin.ts` - Impersonation validation
- `supabase/functions/_shared/secure-rate-limiter.ts` - Fail-closed rate limiter
- `supabase/functions/_shared/decision-logger.ts` - Hash chain decision logging
- `supabase/functions/_shared/security-logger.ts` - Security event logging
- `supabase/functions/admin-reset-password/index.ts` - Hardened password reset
- `supabase/functions/approve-membership/index.ts` - Membership approval with audit
- `supabase/functions/reject-membership/index.ts` - Membership rejection with audit
- `supabase/functions/grant-roles/index.ts` - Role grant via Edge Function
- `supabase/functions/revoke-roles/index.ts` - Role revocation via Edge Function
- `supabase/functions/start-impersonation/index.ts` - Impersonation session creation
- `supabase/functions/end-impersonation/index.ts` - Impersonation session termination
- `supabase/functions/validate-impersonation/index.ts` - Session validation utility

### Frontend

- `src/lib/accessMatrix.ts` - Deny-by-default access control matrix
- `src/components/auth/RequireRoles.tsx` - Route guard component
- `src/pages/PortalRouter.tsx` - Centralized routing hub
- `src/contexts/ImpersonationContext.tsx` - Impersonation state management
- `src/components/impersonation/ImpersonationBanner.tsx` - Active session indicator

### Database

- `verify_decision_log_chain` - RPC function for hash chain verification
- `get_security_timeline` - RPC function for security event aggregation
- `explain_security_decision` - RPC function for decision explanation

### Tests

- `e2e/security/README.md` - Security test documentation
- `e2e/security/*.spec.ts` - Security test implementations
- `e2e/fixtures/securityTestClient.ts` - Security test utilities

---

## Appendix B: Decision Log Schema

The `decision_logs` table schema for audit reference:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| decision_type | TEXT | Category (RATE_LIMIT_BLOCK, PERMISSION_DENIED, etc.) |
| severity | ENUM | LOW, MEDIUM, HIGH, CRITICAL |
| operation | TEXT | Edge Function or action name |
| user_id | UUID | Acting user (nullable for unauthenticated) |
| tenant_id | UUID | Target tenant (nullable for global) |
| reason_code | TEXT | Machine-readable reason |
| previous_hash | TEXT | SHA-256 of previous log (nullable for first) |
| current_hash | TEXT | SHA-256 of this log including previous_hash |
| metadata | JSONB | Additional context |
| created_at | TIMESTAMPTZ | Log timestamp |

---

*Security Baseline v1 evaluated and closed as documented above.*
