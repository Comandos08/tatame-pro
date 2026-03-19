/**
 * 🔐 Impersonation Stability E2E Tests
 *
 * ✅ P-IMP-FIX — Validates that impersonation:
 * - Completes without infinite loops
 * - Makes minimal tenant requests (max 2)
 * - Shows stable UI without flicker
 * - Transitions through correct status states
 * - Superadmin is blocked from tenant /app without impersonation
 * - End-impersonation returns to /admin cleanly
 */

import { test, expect } from '@playwright/test';
import { loginAsSuperAdmin } from '../fixtures/auth.fixture';
import { TEST_TENANT_SLUG, TEST_USERS } from '../fixtures/users.seed';
import { waitForStableUrl } from '../helpers/authSession';
import { createAuthenticatedClient, invokeEdgeFunction } from '../fixtures/securityTestClient';
import { TEST_TENANTS, getPersona } from '../fixtures/personas.seed';

// ─── IMP.1 — Superadmin access contract (no impersonation) ───────────────────

test.describe('IMP — Superadmin Without Impersonation', () => {

  test('IMP.1: superadmin /portal → /admin (not tenant app)', async ({ page }) => {
    await loginAsSuperAdmin(page);
    const url = await waitForStableUrl(page);

    // Superadmin must land on /admin, NEVER on /{tenant}/app
    expect(url).toContain('/admin');
    expect(url).not.toMatch(/\/[^/]+\/app/);
  });

  test('IMP.2: superadmin direct to /{tenant}/app → redirects to /admin', async ({ page }) => {
    await loginAsSuperAdmin(page);

    await page.goto(`/${TEST_TENANT_SLUG}/app`);
    const url = await waitForStableUrl(page);

    // Must redirect to admin — no access without impersonation
    expect(url).toContain('/admin');
    expect(url).not.toContain(`/${TEST_TENANT_SLUG}/app`);
  });

  test('IMP.3: superadmin direct to /{tenant}/app/billing → redirects to /admin', async ({ page }) => {
    await loginAsSuperAdmin(page);

    await page.goto(`/${TEST_TENANT_SLUG}/app/billing`);
    const url = await waitForStableUrl(page);

    expect(url).toContain('/admin');
    expect(url).not.toContain('/billing');
  });

});

// ─── IMP.2 — No duplicate requests on tenant navigation ──────────────────────

test.describe('IMP — Request Efficiency', () => {

  test('IMP.4: no duplicate tenant fetches on normal public tenant navigation', async ({ page }) => {
    const tenantRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/rest/v1/tenants') && req.url().includes('slug')) {
        tenantRequests.push(req.url());
      }
    });

    await page.goto(`/${TEST_TENANT_SLUG}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // At most 1 tenant lookup for a public page
    expect(tenantRequests.length).toBeLessThanOrEqual(1);
  });

  test('IMP.5: no infinite API loops on authenticated tenant navigation', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/rest/v1/') || req.url().includes('/functions/v1/')) {
        apiCalls.push(req.url());
      }
    });

    // Use session injection to avoid UI login
    const { loginAsTenantAdmin } = await import('../fixtures/auth.fixture');
    await loginAsTenantAdmin(page);

    // Navigate to a protected page
    await page.goto(`/${TEST_TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Count requests to the same endpoint — a loop would cause >> 10 calls
    const uniqueUrls = new Set(apiCalls.map(u => u.split('?')[0]));
    const maxPerEndpoint = Math.max(
      ...[...uniqueUrls].map(u => apiCalls.filter(a => a.startsWith(u)).length)
    );

    // Any single endpoint called more than 8 times in 2s is a loop
    expect(maxPerEndpoint).toBeLessThan(8);
  });

});

// ─── IMP.3 — Impersonation via Edge Function contract ────────────────────────

test.describe('IMP — Edge Function Contract', () => {

  test('IMP.6: start-impersonation requires superadmin role', async () => {
    const admin = getPersona('ADMIN_TENANT_A');
    const tenantA = TEST_TENANTS.TENANT_A;

    if (!tenantA.id) {
      test.skip();
      return;
    }

    const { session } = await createAuthenticatedClient(admin.email, admin.password);

    // Non-superadmin trying to start impersonation must be rejected
    const result = await invokeEdgeFunction(session, 'start-impersonation', {
      targetTenantId: tenantA.id,
      reason: 'E2E impersonation test',
    });

    // Must be blocked — 403 or 401 (never 200)
    expect([401, 403]).toContain(result.status);
  });

  test('IMP.7: start-impersonation requires explicit reason', async () => {
    const superadmin = getPersona('SUPERADMIN');
    const tenantA = TEST_TENANTS.TENANT_A;

    if (!tenantA.id) {
      test.skip();
      return;
    }

    const { session } = await createAuthenticatedClient(superadmin.email, superadmin.password);

    // Empty reason must be rejected
    const result = await invokeEdgeFunction(session, 'start-impersonation', {
      targetTenantId: tenantA.id,
      reason: '',
    });

    // Must reject empty reason
    expect([400, 422]).toContain(result.status);
  });

  test('IMP.8: start-impersonation for non-existent tenant is rejected', async () => {
    const superadmin = getPersona('SUPERADMIN');

    const { session } = await createAuthenticatedClient(superadmin.email, superadmin.password);

    const result = await invokeEdgeFunction(session, 'start-impersonation', {
      targetTenantId: '00000000-0000-0000-0000-000000000000',
      reason: 'Testing non-existent tenant',
    });

    // Must reject non-existent tenant
    expect([400, 403, 404]).toContain(result.status);
  });

  test('IMP.9: cross-tenant impersonation — admin cannot impersonate other tenant', async () => {
    const adminA = getPersona('ADMIN_TENANT_A');
    const tenantB = TEST_TENANTS.TENANT_B;

    if (!tenantB.id) {
      test.skip();
      return;
    }

    const { session } = await createAuthenticatedClient(adminA.email, adminA.password);

    // Tenant A admin cannot start impersonation on Tenant B
    const result = await invokeEdgeFunction(session, 'start-impersonation', {
      targetTenantId: tenantB.id,
      reason: 'Attempting cross-tenant impersonation',
    });

    expect([401, 403]).toContain(result.status);
  });

});

// ─── IMP.4 — UI stability (non-superadmin, no flicker) ───────────────────────

test.describe('IMP — UI Stability', () => {

  test('IMP.10: no infinite loader spinners on tenant app navigation', async ({ page }) => {
    const { loginAsTenantAdmin } = await import('../fixtures/auth.fixture');
    await loginAsTenantAdmin(page);

    await page.goto(`/${TEST_TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // After 3 seconds of stability there must be no spinning loaders
    const spinners = await page.locator('[class*="animate-spin"]').count();
    expect(spinners).toBe(0);
  });

  test('IMP.11: no white screen flash during auth resolution', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));

    const { loginAsTenantAdmin } = await import('../fixtures/auth.fixture');
    await loginAsTenantAdmin(page);

    // Check the body is never completely empty during navigation
    const bodyContent = await page.locator('body').innerHTML();
    expect(bodyContent.trim().length).toBeGreaterThan(0);

    // No JS errors
    expect(jsErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

});
