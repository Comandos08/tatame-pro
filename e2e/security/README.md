# 🔐 TATAME E2E Security Tests

Comprehensive security validation suite for the TATAME multi-tenant platform.

## Overview

These tests validate the **deny-by-default** architecture, ensuring:
- No unauthorized access to tenant data
- Superadmin operations require active impersonation
- Users cannot become orphaned (without context)
- All sensitive operations are audited
- Direct API bypass attempts are blocked
- **GAP 6**: Rate limiting with fail-closed behavior
- **GAP 7**: Log immutability and hash chain integrity

## Test Scenarios

### Scenario 1: Superadmin WITHOUT Impersonation
**Risk Mitigated**: Superadmin privilege abuse without accountability
- Tests that superadmins CANNOT perform tenant operations without an active impersonation session
- Validates 403 responses for grant-roles, revoke-roles, complete-tenant-onboarding

### Scenario 2: Superadmin WITH Valid Impersonation
**Risk Mitigated**: Legitimate superadmin operations failing
- Tests that superadmins CAN perform operations with valid impersonation
- Validates audit logs contain impersonation_id for traceability

### Scenario 3: Cross-Tenant Isolation
**Risk Mitigated**: Data breach between tenants
- Tests that Tenant A admin cannot access/modify Tenant B data
- Validates RLS and backend role checks work together

### Scenario 4: Orphan User Prevention (Roles)
**Risk Mitigated**: Users left without any context/access
- Tests that removing the last role without `forceRemoveAll` fails
- Prevents accidental orphaning of users

### Scenario 5: Force Remove All (Explicit Termination)
**Risk Mitigated**: Legitimate membership termination blocked
- Tests that explicit termination with `forceRemoveAll=true` works
- Validates audit log contains the force flag

### Scenario 6: Tenant Onboarding Enforcement (UI)
**Risk Mitigated**: Tenant operating with incomplete setup
- Tests that incomplete tenants are blocked from protected routes
- Validates redirect to onboarding wizard

### Scenario 7: Onboarding Completion (API)
**Risk Mitigated**: Premature onboarding completion
- Tests that onboarding requires minimum setup (academy, grading scheme)
- Validates proper audit logging on completion

### Scenario 8: Orphan User Routing (UI)
**Risk Mitigated**: Orphan users accessing protected areas
- Tests that users without tenant/membership cannot access /app
- Validates redirect to /join flow

### Scenario 9: Direct API Bypass Attacks
**Risk Mitigated**: Frontend bypass via direct API calls
- Tests that edge functions enforce authorization regardless of caller
- Validates 403/401 for all unauthorized attempts

### Scenario 10: Audit Log Integrity
**Risk Mitigated**: Missing or inconsistent audit trail
- Tests that all sensitive operations create proper audit logs
- Validates metadata completeness (tenant_id, profile_id, impersonation_id)

## GAP 7: Immutability & Governance

### Immutable Tables
The following tables are protected from UPDATE/DELETE:

| Table | Purpose | Hash Chain |
|-------|---------|------------|
| `audit_logs` | System events | No |
| `security_events` | Security violations | Optional |
| `decision_logs` | Block/denial decisions | Yes (SHA-256) |

### Hash Chain Integrity
The `decision_logs` table uses SHA-256 hash chaining:

```
Log 1: previous_hash = null,     current_hash = SHA256(payload_1)
Log 2: previous_hash = hash_1,   current_hash = SHA256(payload_2 + hash_1)
Log 3: previous_hash = hash_2,   current_hash = SHA256(payload_3 + hash_2)
```

Verify chain integrity:
```sql
SELECT * FROM verify_decision_log_chain('tenant-uuid');
```

### Decision Types Logged
- `RATE_LIMIT_BLOCK` - Request blocked due to rate limiting
- `PERMISSION_DENIED` - Insufficient permissions for operation
- `IMPERSONATION_BLOCK` - Invalid/missing impersonation session
- `CROSS_TENANT_BLOCK` - Cross-tenant access attempt
- `ONBOARDING_BLOCK` - Incomplete tenant attempting protected operation

## Running the Tests

```bash
# Run all security tests
npx playwright test e2e/security/

# Run specific scenario
npx playwright test e2e/security/governance-tests.spec.ts

# Run with UI (debugging)
npx playwright test e2e/security/ --ui
```

## Environment Variables Required

```env
# Test tenant configuration
E2E_TEST_TENANT_SLUG=demo-bjj
E2E_TENANT_A_ID=<uuid>
E2E_TENANT_B_ID=<uuid>
E2E_TENANT_B_SLUG=tenant-b
E2E_TENANT_INCOMPLETE_ID=<uuid>
E2E_TENANT_INCOMPLETE_SLUG=tenant-incomplete

# Test user credentials
E2E_SUPERADMIN_EMAIL=superadmin@test.local
E2E_SUPERADMIN_PASSWORD=Test123!
E2E_TENANT_ADMIN_EMAIL=admin@test.local
E2E_TENANT_ADMIN_PASSWORD=Test123!
E2E_STAFF_EMAIL=staff@test.local
E2E_STAFF_PASSWORD=Test123!
E2E_ATHLETE_EMAIL=athlete@test.local
E2E_ATHLETE_PASSWORD=Test123!
E2E_NO_CONTEXT_EMAIL=nocontext@test.local
E2E_NO_CONTEXT_PASSWORD=Test123!
E2E_TENANT_B_ADMIN_EMAIL=admin-b@test.local
E2E_TENANT_B_ADMIN_PASSWORD=Test123!
E2E_SINGLE_ROLE_EMAIL=singlerole@test.local
E2E_SINGLE_ROLE_PASSWORD=Test123!
E2E_INCOMPLETE_ADMIN_EMAIL=admin-incomplete@test.local
E2E_INCOMPLETE_ADMIN_PASSWORD=Test123!

# Optional: For destructive/impersonation tests
E2E_ACTIVE_IMPERSONATION_ID=<uuid>
E2E_TEST_TARGET_USER_ID=<uuid>
E2E_FORCE_REMOVE_TEST_USER_ID=<uuid>
E2E_SINGLE_ROLE_USER_ID=<uuid>
E2E_AUDIT_TEST_USER_ID=<uuid>
E2E_ONBOARDING_TEST_TENANT_ID=<uuid>
```

## Test Data Requirements

Before running tests, ensure the test database has:

1. **Test Tenants**:
   - Tenant A: Active, onboarding complete
   - Tenant B: Active, for isolation tests
   - Tenant Incomplete: onboarding_completed=false

2. **Test Users** with proper roles:
   - Superadmin (SUPERADMIN_GLOBAL, no tenant)
   - Admin Tenant A (ADMIN_TENANT in Tenant A)
   - Staff Tenant A (STAFF_ORGANIZACAO in Tenant A)
   - Athlete Tenant A (ATLETA in Tenant A)
   - Admin Tenant B (ADMIN_TENANT in Tenant B)
   - Orphan User (authenticated, no roles/membership)
   - Single Role User (exactly 1 role for orphan prevention test)

## Security Principles Validated

| Principle | Tests |
|-----------|-------|
| **Deny by Default** | All scenarios |
| **Least Privilege** | 3, 9 |
| **Tenant Isolation** | 3, 10 |
| **Audit Trail** | 1, 2, 5, 7, 10 |
| **Orphan Prevention** | 4, 5, 8 |
| **Impersonation Accountability** | 1, 2 |
| **Onboarding Enforcement** | 6, 7 |

## Troubleshooting

### Tests failing with 500 errors
- Check edge function logs in Supabase dashboard
- Verify SUPABASE_SERVICE_ROLE_KEY is set correctly

### Tests failing with "User not found"
- Ensure test users are seeded in the database
- Verify email/password match environment variables

### Impersonation tests skipped
- These require active impersonation sessions
- Create impersonation via start-impersonation function first

### Cross-tenant tests failing unexpectedly
- Verify Tenant B exists and has proper configuration
- Check RLS policies are enabled on all tables
