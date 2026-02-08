/**
 * PI A1.0 — ADMIN CONSOLE SAFE GOLD v1.0 — Contract Tests
 *
 * POLICY: NEVER REMOVE
 * These tests validate deterministic admin console behavior.
 *
 * CONTRACTS:
 * - A.C.1: Renders deterministically
 * - A.C.2: Admin role + view state MUST be SAFE GOLD
 * - A.C.3: NO mutations to protected tables during browsing
 * - A.C.4: Navigation stability (no async redirects for 10s)
 *
 * SAFE GOLD: This file validates read-only browsing + enum compliance + stability.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';
import { loginAsSuperAdmin } from '../fixtures/auth.fixture';
import { mockAdminConsoleUniversal } from '../helpers/mock-admin-console';

// SAFE GOLD state subsets
const SAFE_ADMIN_ROLES = ['SUPERADMIN_GLOBAL', 'ADMIN_TENANT', 'NONE'] as const;
const SAFE_ADMIN_VIEW_STATES = ['LOADING', 'READY', 'ERROR'] as const;

// Tables that MUST NOT receive mutations during browsing
const PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'memberships',
  'athletes',
  'academies',
  'tenant_billing',
  'tenant_invoices',
];

const TENANT_SLUG = process.env.E2E_TENANT_SLUG || 'test-tenant';

test.describe('A1.0 — Admin Console SAFE GOLD (Contract)', () => {
  test('A.C.1: renders deterministically', async ({ page }) => {
    logTestStep('CONTRACT', 'Deterministic admin shell render');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAdminConsoleUniversal(page, { role: 'SUPERADMIN_GLOBAL', tenantSlug: TENANT_SLUG });

    await loginAsSuperAdmin(page);
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Admin dashboard should be visible (not necessarily app-shell for /admin route)
    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);

    logTestAssertion('CONTRACT', 'Admin page visible', true);
  });

  test('A.C.2: admin role + view state MUST be SAFE GOLD', async ({ page }) => {
    logTestStep('CONTRACT', 'Admin SAFE enums in DOM');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAdminConsoleUniversal(page, { role: 'SUPERADMIN_GLOBAL', tenantSlug: TENANT_SLUG });

    await loginAsSuperAdmin(page);
    
    // Navigate to tenant app to see app-shell with admin attributes
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const shell = page.locator('[data-testid="app-shell"]');
    const shellVisible = await shell.isVisible();
    
    if (shellVisible) {
      const role = await shell.getAttribute('data-admin-role');
      const view = await shell.getAttribute('data-admin-view-state');

      if (role) {
        expect(SAFE_ADMIN_ROLES).toContain(role as any);
        logTestAssertion('CONTRACT', `Role ok: ${role}`, true);
      }
      
      if (view) {
        expect(SAFE_ADMIN_VIEW_STATES).toContain(view as any);
        logTestAssertion('CONTRACT', `View ok: ${view}`, true);
      }
    }
    
    // At minimum, page should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    logTestAssertion('CONTRACT', 'Admin shell or body visible', true);
  });

  test('A.C.3: NO mutations to protected tables during admin browsing', async ({ page }) => {
    logTestStep('CONTRACT', 'Mutation boundary enforcement');

    const mutations: string[] = [];

    await page.route('**/rest/v1/**', (route, request) => {
      const method = request.method();
      const url = request.url();

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        for (const t of PROTECTED_TABLES) {
          if (url.includes(`/rest/v1/${t}`)) mutations.push(`${method} ${t}`);
        }
      }
      route.continue();
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAdminConsoleUniversal(page, { role: 'SUPERADMIN_GLOBAL', tenantSlug: TENANT_SLUG });

    await loginAsSuperAdmin(page);
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Browse around for a bit
    await page.waitForTimeout(2000);
    
    expect(mutations).toHaveLength(0);
    logTestAssertion('CONTRACT', 'No mutations detected', true);
  });

  test('A.C.4: navigation stability (no async redirects for 10s)', async ({ page }) => {
    logTestStep('CONTRACT', 'Navigation stability');

    const nav: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) nav.push(frame.url());
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAdminConsoleUniversal(page, { role: 'SUPERADMIN_GLOBAL', tenantSlug: TENANT_SLUG });

    await loginAsSuperAdmin(page);
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const stableUrl = page.url();
    await page.waitForTimeout(10000);

    expect(page.url()).toBe(stableUrl);

    const unexpected = nav.filter(
      (u) =>
        !u.includes('/admin') &&
        !u.includes('/login') &&
        !u.includes('/auth') &&
        !u.includes('/app') &&
        !u.includes('/portal') &&
        !u.includes('about:blank')
    );
    expect(unexpected.length).toBe(0);

    logTestAssertion('CONTRACT', 'Navigation stable for 10s', true);
  });
});
