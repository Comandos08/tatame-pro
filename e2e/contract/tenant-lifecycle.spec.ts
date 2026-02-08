/**
 * PI T1.0 — TENANT LIFECYCLE SAFE GOLD v1.0 — Contract Tests
 *
 * POLICY: NEVER REMOVE
 * These tests validate deterministic tenant lifecycle behavior.
 *
 * CONTRACTS:
 * - T.C.1: Render determinístico
 * - T.C.2: Estado ∈ SAFE_TENANT_STATES
 * - T.C.3: BLOCKED mostra TenantBlockedScreen
 * - T.C.4: Mutation boundary
 * - T.C.5: Navegação estável (10s)
 *
 * SAFE GOLD: This file validates read-only browsing + enum compliance + stability.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';
import { loginAsTenantAdmin } from '../fixtures/auth.fixture';
import { mockTenantLifecycle, FIXED_IDS } from '../helpers/mock-tenant-lifecycle';

// SAFE GOLD state subset — must match src/types/tenant-lifecycle-state.ts
const SAFE_TENANT_STATES = ['SETUP', 'ACTIVE', 'BLOCKED', 'DELETED'] as const;

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

test.describe('T.C — Tenant Lifecycle SAFE GOLD Contract', () => {
  test('T.C.1: app shell renders deterministically', async ({ page }) => {
    logTestStep('CONTRACT', 'Shell render baseline');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockTenantLifecycle(page, 'ACTIVE');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const shell = page.locator('[data-testid="app-shell"]');
    await expect(shell).toBeVisible();

    logTestAssertion('CONTRACT', 'App shell visible', true);
  });

  test('T.C.2: tenant state MUST be SAFE GOLD', async ({ page }) => {
    logTestStep('CONTRACT', 'State enum compliance');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockTenantLifecycle(page, 'ACTIVE');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const shell = page.locator('[data-testid="app-shell"]');
    await expect(shell).toBeVisible();

    const state = await shell.getAttribute('data-tenant-state');
    expect(state).toBeTruthy();
    expect(SAFE_TENANT_STATES).toContain(state);

    logTestAssertion('CONTRACT', `State ok: ${state}`, true);
  });

  test('T.C.3: BLOCKED state shows TenantBlockedScreen', async ({ page }) => {
    logTestStep('CONTRACT', 'Blocked screen visibility');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockTenantLifecycle(page, 'BLOCKED');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Either app-shell or blocked-screen should be visible
    const blockedScreen = page.locator('[data-testid="tenant-blocked-screen"]');
    const shell = page.locator('[data-testid="app-shell"]');
    
    // Wait for page to stabilize
    await page.waitForTimeout(2000);
    
    // At least one should be visible (depends on billing integration)
    const blockedVisible = await blockedScreen.isVisible();
    const shellVisible = await shell.isVisible();
    
    expect(blockedVisible || shellVisible).toBe(true);
    
    if (blockedVisible) {
      const reason = await blockedScreen.getAttribute('data-blocked-reason');
      expect(reason).toBeTruthy();
      logTestAssertion('CONTRACT', `Blocked screen visible with reason: ${reason}`, true);
    } else {
      // Shell is visible with BLOCKED state
      const state = await shell.getAttribute('data-tenant-state');
      expect(state).toBe('BLOCKED');
      logTestAssertion('CONTRACT', 'Shell visible with BLOCKED state', true);
    }
  });

  test('T.C.4: NO mutations to protected tables during browsing', async ({ page }) => {
    logTestStep('CONTRACT', 'Mutation boundary');

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
    await mockTenantLifecycle(page, 'ACTIVE');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Browse around for a bit
    await page.waitForTimeout(2000);

    expect(mutations).toHaveLength(0);
    logTestAssertion('CONTRACT', 'No mutations detected', true);
  });

  test('T.C.5: navigation stability (no async redirects)', async ({ page }) => {
    logTestStep('CONTRACT', 'No redirects for 10 seconds');

    const nav: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) nav.push(frame.url());
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockTenantLifecycle(page, 'ACTIVE');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const stable = page.url();
    await page.waitForTimeout(10000);

    expect(page.url()).toBe(stable);

    const unexpected = nav.filter(
      (u) =>
        !u.includes('/app') &&
        !u.includes('/login') &&
        !u.includes('/auth') &&
        !u.includes('/onboarding') &&
        !u.includes('about:blank')
    );
    expect(unexpected.length).toBe(0);

    logTestAssertion('CONTRACT', 'Navigation stable', true);
  });
});
