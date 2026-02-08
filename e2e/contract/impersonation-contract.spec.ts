/**
 * PI I1.0 — IMPERSONATION SAFE GOLD v1.0 — Contract Tests
 *
 * POLICY: NEVER REMOVE
 * These tests validate deterministic impersonation behavior.
 *
 * CONTRACTS:
 * - I.C.1: App shell renders deterministically
 * - I.C.2: Impersonation state MUST be SAFE GOLD subset
 * - I.C.3: NO mutations to protected tables during browsing
 * - I.C.4: Navigation stability (no async redirects for 10s)
 * - I.C.5: ON/OFF state switch is reflected in DOM
 *
 * SAFE GOLD: This file validates read-only browsing + enum compliance + stability.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';
import { loginAsTenantAdmin, loginAsSuperAdmin } from '../fixtures/auth.fixture';
import { mockImpersonationUniversal, FIXED_IDS } from '../helpers/mock-impersonation';

// SAFE GOLD state subset — must match src/types/impersonation-state.ts
const SAFE_IMPERSONATION_STATES = ['OFF', 'ON'] as const;

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
  'superadmin_impersonations', // PI I1.0 explicit
];

const TENANT_SLUG = process.env.E2E_TENANT_SLUG || 'test-tenant';

test.describe('I.C — Impersonation SAFE GOLD Contract', () => {
  test('I.C.1: app shell renders deterministically', async ({ page }) => {
    logTestStep('CONTRACT', 'Shell render baseline');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockImpersonationUniversal(page, { enabled: false });

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const shell = page.locator('[data-testid="app-shell"]');
    await expect(shell).toBeVisible();

    logTestAssertion('CONTRACT', 'App shell visible', true);
  });

  test('I.C.2: impersonation state MUST be SAFE GOLD', async ({ page }) => {
    logTestStep('CONTRACT', 'State enum compliance');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockImpersonationUniversal(page, { enabled: true });

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const shell = page.locator('[data-testid="app-shell"]');
    await expect(shell).toBeVisible();

    const state = await shell.getAttribute('data-impersonation-state');
    expect(state).toBeTruthy();
    expect(SAFE_IMPERSONATION_STATES).toContain(state);

    logTestAssertion('CONTRACT', `State ok: ${state}`, true);
  });

  test('I.C.3: NO mutations to protected tables during browsing', async ({ page }) => {
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
    await mockImpersonationUniversal(page, { enabled: false });

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Browse around for a bit
    await page.waitForTimeout(2000);

    expect(mutations).toHaveLength(0);
    logTestAssertion('CONTRACT', 'No mutations detected', true);
  });

  test('I.C.4: navigation stability (no async redirects)', async ({ page }) => {
    logTestStep('CONTRACT', 'No redirects for 10 seconds');

    const nav: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) nav.push(frame.url());
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockImpersonationUniversal(page, { enabled: false });

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
        !u.includes('about:blank')
    );
    expect(unexpected.length).toBe(0);

    logTestAssertion('CONTRACT', 'Navigation stable', true);
  });

  test('I.C.5: ON/OFF state switch is reflected in DOM', async ({ page }) => {
    logTestStep('CONTRACT', 'Deterministic toggle by mock');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    await loginAsSuperAdmin(page);

    // Test OFF state
    await mockImpersonationUniversal(page, { enabled: false });
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const shell1 = page.locator('[data-testid="app-shell"]');
    await expect(shell1).toBeVisible();
    const off = await shell1.getAttribute('data-impersonation-state');
    expect(off).toBe('OFF');

    // Test ON state
    await mockImpersonationUniversal(page, { enabled: true });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const shell2 = page.locator('[data-testid="app-shell"]');
    await expect(shell2).toBeVisible();
    const on = await shell2.getAttribute('data-impersonation-state');
    expect(on).toBe('ON');

    logTestAssertion('CONTRACT', `OFF->ON ok (${off} -> ${on})`, true);
  });
});
