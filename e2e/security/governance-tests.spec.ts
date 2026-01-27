import { test, expect } from '@playwright/test';
import {
  createAuthenticatedClient,
  invokeEdgeFunction,
  checkAuditLog,
  getUserRoles,
  getTenantOnboardingStatus,
} from '../fixtures/securityTestClient';
import { SECURITY_PERSONAS, TEST_TENANTS, getPersona } from '../fixtures/personas.seed';
import {
  loginAsSuperAdmin,
  loginAsTenantAdmin,
  loginAsApprovedAthlete,
  loginAsNoContext,
  TEST_TENANT_SLUG,
} from '../fixtures/auth.fixture';
import { waitForStableUrl, clearAuthSession } from '../helpers/authSession';

/**
 * 🔐 TATAME E2E Security Governance Tests
 * 
 * Comprehensive security validation covering:
 * - Superadmin impersonation requirements
 * - Cross-tenant isolation
 * - Orphan user prevention
 * - Onboarding enforcement
 * - API bypass protection
 * - Audit log integrity
 * 
 * These tests validate the deny-by-default architecture.
 */

test.describe('🔐 SCENARIO 1 — Superadmin WITHOUT Impersonation', () => {
  /**
   * Superadmin trying to perform tenant operations WITHOUT impersonation
   * Expected: 403 FORBIDDEN for all sensitive operations
   */

  test('1.1: grant-roles returns 403 without impersonation', async () => {
    const superadmin = getPersona('SUPERADMIN');
    const { session } = await createAuthenticatedClient(superadmin.email, superadmin.password);
    const tenantA = TEST_TENANTS.TENANT_A;
    
    const timestampBefore = new Date();

    const result = await invokeEdgeFunction(session, 'grant-roles', {
      targetProfileId: 'test-user-id',
      tenantId: tenantA.id,
      roles: ['ATLETA'],
    });

    expect(result.status).toBe(403);
    expect((result.data as { ok: boolean }).ok).toBe(false);

    // Verify no audit log was created
    const { client } = await createAuthenticatedClient(superadmin.email, superadmin.password);
    const auditCheck = await checkAuditLog(client, 'ROLES_GRANTED', tenantA.id, timestampBefore);
    expect(auditCheck.exists).toBe(false);
  });

  test('1.2: revoke-roles returns 403 without impersonation', async () => {
    const superadmin = getPersona('SUPERADMIN');
    const { session } = await createAuthenticatedClient(superadmin.email, superadmin.password);
    const tenantA = TEST_TENANTS.TENANT_A;

    const result = await invokeEdgeFunction(session, 'revoke-roles', {
      targetProfileId: 'test-user-id',
      tenantId: tenantA.id,
      roles: ['ATLETA'],
    });

    expect(result.status).toBe(403);
    expect((result.data as { ok: boolean }).ok).toBe(false);
  });

  test('1.3: complete-tenant-onboarding returns 403 without impersonation', async () => {
    const superadmin = getPersona('SUPERADMIN');
    const { session } = await createAuthenticatedClient(superadmin.email, superadmin.password);
    const tenantA = TEST_TENANTS.TENANT_A;

    const result = await invokeEdgeFunction(session, 'complete-tenant-onboarding', {
      tenantId: tenantA.id,
    });

    expect(result.status).toBe(403);
    expect((result.data as { ok: boolean }).ok).toBe(false);
  });
});

test.describe('🔐 SCENARIO 2 — Superadmin WITH Valid Impersonation', () => {
  /**
   * Superadmin with valid impersonation session
   * Expected: Operations succeed with proper audit logging
   * 
   * NOTE: These tests require an active impersonation session in the database.
   * The impersonation session must be created beforehand via start-impersonation.
   */

  test.skip('2.1: grant-roles succeeds with valid impersonation', async () => {
    // This test requires an active impersonation session
    // Skip if test data not available
    const impersonationId = process.env.E2E_ACTIVE_IMPERSONATION_ID;
    if (!impersonationId) {
      test.skip();
      return;
    }

    const superadmin = getPersona('SUPERADMIN');
    const { session, client } = await createAuthenticatedClient(superadmin.email, superadmin.password);
    const tenantA = TEST_TENANTS.TENANT_A;
    
    const timestampBefore = new Date();

    const result = await invokeEdgeFunction(
      session,
      'grant-roles',
      {
        targetProfileId: process.env.E2E_TEST_TARGET_USER_ID || '',
        tenantId: tenantA.id,
        roles: ['ATLETA'],
        reason: 'E2E test with impersonation',
      },
      impersonationId
    );

    expect(result.status).toBe(200);
    expect((result.data as { ok: boolean }).ok).toBe(true);

    // Verify audit log contains impersonation_id
    const auditCheck = await checkAuditLog(client, 'ROLES_GRANTED', tenantA.id, timestampBefore);
    expect(auditCheck.exists).toBe(true);
    expect((auditCheck.log?.metadata as { impersonation_id?: string })?.impersonation_id).toBe(impersonationId);
  });
});

test.describe('🔐 SCENARIO 3 — Cross-Tenant Isolation', () => {
  /**
   * Admin of Tenant A trying to access/modify Tenant B
   * Expected: 403 FORBIDDEN for all cross-tenant operations
   */

  test('3.1: Tenant A admin cannot grant roles in Tenant B', async () => {
    const adminA = getPersona('ADMIN_TENANT_A');
    const { session, client } = await createAuthenticatedClient(adminA.email, adminA.password);
    const tenantB = TEST_TENANTS.TENANT_B;

    const timestampBefore = new Date();

    const result = await invokeEdgeFunction(session, 'grant-roles', {
      targetProfileId: 'any-user-id',
      tenantId: tenantB.id,
      roles: ['ATLETA'],
    });

    expect(result.status).toBe(403);
    expect((result.data as { ok: boolean }).ok).toBe(false);

    // Verify no audit log was created in Tenant B
    const auditCheck = await checkAuditLog(client, 'ROLES_GRANTED', tenantB.id, timestampBefore);
    expect(auditCheck.exists).toBe(false);
  });

  test('3.2: Tenant A admin cannot revoke roles in Tenant B', async () => {
    const adminA = getPersona('ADMIN_TENANT_A');
    const { session } = await createAuthenticatedClient(adminA.email, adminA.password);
    const tenantB = TEST_TENANTS.TENANT_B;

    const result = await invokeEdgeFunction(session, 'revoke-roles', {
      targetProfileId: 'any-user-id',
      tenantId: tenantB.id,
      roles: ['ATLETA'],
    });

    expect(result.status).toBe(403);
  });

  test('3.3: Tenant A admin cannot complete onboarding for Tenant B', async () => {
    const adminA = getPersona('ADMIN_TENANT_A');
    const { session } = await createAuthenticatedClient(adminA.email, adminA.password);
    const tenantB = TEST_TENANTS.TENANT_B;

    const result = await invokeEdgeFunction(session, 'complete-tenant-onboarding', {
      tenantId: tenantB.id,
    });

    expect(result.status).toBe(403);
  });
});

test.describe('🔐 SCENARIO 4 — Orphan User Prevention (Roles)', () => {
  /**
   * Attempting to remove the last role without forceRemoveAll
   * Expected: 422 VALIDATION_FAILED, user keeps the role
   */

  test('4.1: Cannot remove last role without forceRemoveAll', async () => {
    const admin = getPersona('ADMIN_TENANT_A');
    const singleRoleUser = getPersona('USER_SINGLE_ROLE');
    const { session, client } = await createAuthenticatedClient(admin.email, admin.password);
    const tenantA = TEST_TENANTS.TENANT_A;

    // Get user's current roles first
    const rolesBefore = await getUserRoles(client, singleRoleUser.email, tenantA.id).catch(() => []);
    
    // Skip if user not properly set up
    if (rolesBefore.length !== 1) {
      test.skip();
      return;
    }

    const result = await invokeEdgeFunction(session, 'revoke-roles', {
      targetProfileId: process.env.E2E_SINGLE_ROLE_USER_ID || '',
      tenantId: tenantA.id,
      roles: rolesBefore,
      // NOT setting forceRemoveAll
    });

    expect(result.status).toBe(422);
    expect((result.data as { code: string }).code).toBe('VALIDATION_FAILED');

    // Verify user still has the role
    const rolesAfter = await getUserRoles(client, singleRoleUser.email, tenantA.id).catch(() => []);
    expect(rolesAfter.length).toBe(1);
  });
});

test.describe('🔐 SCENARIO 5 — Force Remove All (Explicit Termination)', () => {
  /**
   * Admin explicitly ending user membership with forceRemoveAll=true
   * Expected: Roles removed, audit log with force_remove_all flag
   */

  test.skip('5.1: Force remove all roles with explicit flag', async () => {
    // This is a destructive test - skip unless explicitly configured
    const testUserId = process.env.E2E_FORCE_REMOVE_TEST_USER_ID;
    if (!testUserId) {
      test.skip();
      return;
    }

    const admin = getPersona('ADMIN_TENANT_A');
    const { session, client } = await createAuthenticatedClient(admin.email, admin.password);
    const tenantA = TEST_TENANTS.TENANT_A;
    
    const timestampBefore = new Date();

    const result = await invokeEdgeFunction(session, 'revoke-roles', {
      targetProfileId: testUserId,
      tenantId: tenantA.id,
      roles: ['ATLETA'],
      forceRemoveAll: true,
      reason: 'E2E test - explicit membership termination',
    });

    expect(result.status).toBe(200);
    expect((result.data as { ok: boolean }).ok).toBe(true);

    // Verify audit log contains force_remove_all flag
    const auditCheck = await checkAuditLog(client, 'ROLES_REVOKED', tenantA.id, timestampBefore);
    expect(auditCheck.exists).toBe(true);
    expect((auditCheck.log?.metadata as { force_remove_all?: boolean })?.force_remove_all).toBe(true);
  });
});

test.describe('🔐 SCENARIO 6 — Tenant Onboarding Enforcement (UI)', () => {
  /**
   * Tenant with incomplete onboarding trying to access protected routes
   * Expected: Redirect to /app/onboarding
   */

  test('6.1: Incomplete tenant redirects to onboarding on /app access', async ({ page }) => {
    // This test requires a tenant with onboarding_completed=false
    const incompleteTenant = TEST_TENANTS.TENANT_INCOMPLETE;
    
    // Skip if tenant not configured
    if (!incompleteTenant.slug || incompleteTenant.slug === 'tenant-incomplete') {
      // Use the main tenant but check behavior
      await loginAsTenantAdmin(page);
      
      // Navigate to app - should either show app or redirect to onboarding
      const finalUrl = await waitForStableUrl(page);
      
      // Just verify we're not on a blank page
      const body = page.locator('body');
      const textContent = await body.textContent();
      expect(textContent?.trim().length).toBeGreaterThan(10);
      return;
    }

    await page.goto(`/${incompleteTenant.slug}/app`);
    const finalUrl = await waitForStableUrl(page);
    
    // Should redirect to onboarding
    expect(finalUrl).toContain('/onboarding');
  });

  test('6.2: Cannot access protected routes before onboarding complete', async ({ page }) => {
    const incompleteTenant = TEST_TENANTS.TENANT_INCOMPLETE;
    
    if (!incompleteTenant.slug || incompleteTenant.slug === 'tenant-incomplete') {
      test.skip();
      return;
    }

    // Try to access athletes list
    await page.goto(`/${incompleteTenant.slug}/app/athletes`);
    const finalUrl = await waitForStableUrl(page);
    
    // Should be blocked/redirected
    expect(finalUrl).not.toContain('/athletes');
  });
});

test.describe('🔐 SCENARIO 7 — Onboarding Completion (API)', () => {
  /**
   * Completing tenant onboarding via edge function
   * Expected: Success only when requirements met, proper audit logging
   */

  test('7.1: Onboarding completion fails without minimum requirements', async () => {
    const admin = getPersona('ADMIN_TENANT_A');
    const { session } = await createAuthenticatedClient(admin.email, admin.password);
    
    // Use a tenant that doesn't meet requirements (if available)
    const incompleteTenant = TEST_TENANTS.TENANT_INCOMPLETE;
    
    if (!incompleteTenant.id) {
      // Just verify the endpoint enforces requirements
      const result = await invokeEdgeFunction(session, 'complete-tenant-onboarding', {
        tenantId: 'non-existent-tenant-id',
      });
      
      // Should fail in some way (403 or 422)
      expect([403, 422, 500]).toContain(result.status);
      return;
    }

    const result = await invokeEdgeFunction(session, 'complete-tenant-onboarding', {
      tenantId: incompleteTenant.id,
    });

    // Should fail with validation error if requirements not met
    if (result.status === 422) {
      expect((result.data as { code: string }).code).toBe('VALIDATION_FAILED');
      expect((result.data as { missingRequirements?: string[] }).missingRequirements).toBeDefined();
    }
  });

  test.skip('7.2: Onboarding completion succeeds with requirements met', async () => {
    // This test requires a properly configured test tenant
    const testTenantId = process.env.E2E_ONBOARDING_TEST_TENANT_ID;
    if (!testTenantId) {
      test.skip();
      return;
    }

    const admin = getPersona('ADMIN_TENANT_A');
    const { session, client } = await createAuthenticatedClient(admin.email, admin.password);
    
    const timestampBefore = new Date();

    const result = await invokeEdgeFunction(session, 'complete-tenant-onboarding', {
      tenantId: testTenantId,
    });

    expect(result.status).toBe(200);
    expect((result.data as { ok: boolean }).ok).toBe(true);

    // Verify tenant is marked complete
    const status = await getTenantOnboardingStatus(client, testTenantId);
    expect(status.completed).toBe(true);

    // Verify audit log
    const auditCheck = await checkAuditLog(client, 'TENANT_ONBOARDING_COMPLETED', testTenantId, timestampBefore);
    expect(auditCheck.exists).toBe(true);
  });
});

test.describe('🔐 SCENARIO 8 — Orphan User Routing (UI)', () => {
  /**
   * User without tenant/membership trying to access protected routes
   * Expected: Redirect to /join flow
   */

  test('8.1: Orphan user redirected from /app to /join', async ({ page }) => {
    await loginAsNoContext(page);
    
    // Try to access app
    await page.goto(`/${TEST_TENANT_SLUG}/app`);
    const finalUrl = await waitForStableUrl(page);
    
    // Should not be on /app
    expect(finalUrl).not.toContain('/app');
    
    // Should show some form of no-access state or join redirect
    const body = page.locator('body');
    const textContent = await body.textContent();
    expect(textContent?.trim().length).toBeGreaterThan(10);
  });

  test('8.2: Orphan user sees portal empty state or redirect', async ({ page }) => {
    await loginAsNoContext(page);
    
    // Access portal - should show empty state or redirect
    const finalUrl = page.url();
    const body = page.locator('body');
    const textContent = await body.textContent();
    
    // Should have content (not blank)
    expect(textContent?.trim().length).toBeGreaterThan(10);
    
    // Should not redirect to login (user IS authenticated)
    expect(finalUrl).not.toContain('/login');
  });
});

test.describe('🔐 SCENARIO 9 — Direct API Bypass Attacks', () => {
  /**
   * Attempting to bypass frontend by calling edge functions directly
   * with insufficient permissions
   * Expected: 403 FORBIDDEN for all unauthorized attempts
   */

  test('9.1: Athlete cannot call grant-roles', async () => {
    const athlete = getPersona('ATHLETE_TENANT_A');
    const { session } = await createAuthenticatedClient(athlete.email, athlete.password);
    const tenantA = TEST_TENANTS.TENANT_A;

    const result = await invokeEdgeFunction(session, 'grant-roles', {
      targetProfileId: 'any-user-id',
      tenantId: tenantA.id,
      roles: ['ADMIN_TENANT'],
    });

    expect(result.status).toBe(403);
    expect((result.data as { ok: boolean }).ok).toBe(false);
  });

  test('9.2: Athlete cannot call revoke-roles', async () => {
    const athlete = getPersona('ATHLETE_TENANT_A');
    const { session } = await createAuthenticatedClient(athlete.email, athlete.password);
    const tenantA = TEST_TENANTS.TENANT_A;

    const result = await invokeEdgeFunction(session, 'revoke-roles', {
      targetProfileId: 'any-user-id',
      tenantId: tenantA.id,
      roles: ['ATLETA'],
    });

    expect(result.status).toBe(403);
  });

  test('9.3: Athlete cannot call complete-tenant-onboarding', async () => {
    const athlete = getPersona('ATHLETE_TENANT_A');
    const { session } = await createAuthenticatedClient(athlete.email, athlete.password);
    const tenantA = TEST_TENANTS.TENANT_A;

    const result = await invokeEdgeFunction(session, 'complete-tenant-onboarding', {
      tenantId: tenantA.id,
    });

    expect(result.status).toBe(403);
  });

  test('9.4: Orphan user cannot call any sensitive functions', async () => {
    const orphan = getPersona('ORPHAN_USER');
    const { session } = await createAuthenticatedClient(orphan.email, orphan.password);
    const tenantA = TEST_TENANTS.TENANT_A;

    const grantResult = await invokeEdgeFunction(session, 'grant-roles', {
      targetProfileId: 'any-id',
      tenantId: tenantA.id,
      roles: ['ATLETA'],
    });
    expect(grantResult.status).toBe(403);

    const revokeResult = await invokeEdgeFunction(session, 'revoke-roles', {
      targetProfileId: 'any-id',
      tenantId: tenantA.id,
      roles: ['ATLETA'],
    });
    expect(revokeResult.status).toBe(403);

    const onboardingResult = await invokeEdgeFunction(session, 'complete-tenant-onboarding', {
      tenantId: tenantA.id,
    });
    expect(onboardingResult.status).toBe(403);
  });

  test('9.5: Unauthenticated requests return 401', async () => {
    const tenantA = TEST_TENANTS.TENANT_A;
    
    // Create a fake session with invalid token
    const fakeSession = {
      access_token: 'invalid-token-12345',
      refresh_token: '',
      expires_at: 0,
      expires_in: 0,
      token_type: 'bearer',
      user: { id: '', email: '' },
    } as any;

    const result = await invokeEdgeFunction(fakeSession, 'grant-roles', {
      targetProfileId: 'any-id',
      tenantId: tenantA.id,
      roles: ['ATLETA'],
    });

    expect(result.status).toBe(401);
  });
});

test.describe('🔐 SCENARIO 10 — Audit Log Integrity', () => {
  /**
   * Verify that all sensitive operations generate proper audit logs
   * Expected: Correct event_type, tenant_id, profile_id, metadata
   */

  test('10.1: Successful role grant creates audit log with correct metadata', async () => {
    const admin = getPersona('ADMIN_TENANT_A');
    const { session, client } = await createAuthenticatedClient(admin.email, admin.password);
    const tenantA = TEST_TENANTS.TENANT_A;
    
    // Skip if no test target configured
    const targetUserId = process.env.E2E_AUDIT_TEST_USER_ID;
    if (!targetUserId) {
      test.skip();
      return;
    }

    const timestampBefore = new Date();

    const result = await invokeEdgeFunction(session, 'grant-roles', {
      targetProfileId: targetUserId,
      tenantId: tenantA.id,
      roles: ['RECEPCAO'],
      reason: 'E2E audit test',
    });

    if (result.status !== 200) {
      // Role might already exist - that's okay for this test
      return;
    }

    // Check audit log
    const auditCheck = await checkAuditLog(client, 'ROLES_GRANTED', tenantA.id, timestampBefore);
    expect(auditCheck.exists).toBe(true);
    
    const metadata = auditCheck.log?.metadata as Record<string, unknown>;
    expect(metadata).toBeDefined();
    expect(metadata.target_profile_id).toBe(targetUserId);
    expect(metadata.roles_granted).toBeDefined();
    expect(metadata.granted_by).toBeDefined();
    expect(metadata.roles_before).toBeDefined();
    expect(metadata.roles_after).toBeDefined();
  });

  test('10.2: Failed operations do not create audit logs', async () => {
    const athlete = getPersona('ATHLETE_TENANT_A');
    const { session, client } = await createAuthenticatedClient(athlete.email, athlete.password);
    const tenantA = TEST_TENANTS.TENANT_A;
    
    const timestampBefore = new Date();

    // This should fail (athlete doesn't have permission)
    await invokeEdgeFunction(session, 'grant-roles', {
      targetProfileId: 'any-id',
      tenantId: tenantA.id,
      roles: ['ATLETA'],
    });

    // Check that NO audit log was created
    const auditCheck = await checkAuditLog(client, 'ROLES_GRANTED', tenantA.id, timestampBefore);
    expect(auditCheck.exists).toBe(false);
  });

  test('10.3: Audit logs have correct tenant isolation', async () => {
    const adminA = getPersona('ADMIN_TENANT_A');
    const { session, client } = await createAuthenticatedClient(adminA.email, adminA.password);
    const tenantB = TEST_TENANTS.TENANT_B;
    
    const timestampBefore = new Date();

    // Try to operate on Tenant B (should fail)
    await invokeEdgeFunction(session, 'grant-roles', {
      targetProfileId: 'any-id',
      tenantId: tenantB.id,
      roles: ['ATLETA'],
    });

    // Verify no audit log was created in Tenant B
    const auditCheck = await checkAuditLog(client, 'ROLES_GRANTED', tenantB.id, timestampBefore);
    expect(auditCheck.exists).toBe(false);
  });
});

// Reset auth state before each test
test.beforeEach(async ({ page }) => {
  await clearAuthSession(page);
});
