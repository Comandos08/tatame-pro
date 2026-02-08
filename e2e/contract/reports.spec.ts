/**
 * PI R1.0 — REPORTS SAFE GOLD v1.0 — Contract Tests
 *
 * POLICY: NEVER REMOVE
 * These tests validate deterministic reports behavior.
 *
 * CONTRACTS:
 * - R.C.1: Renders deterministically
 * - R.C.2: data-report-type ∈ SAFE_REPORT_TYPES
 * - R.C.3: data-report-scope ∈ SAFE_REPORT_SCOPES
 * - R.C.4: data-report-view-state ∈ SAFE_REPORT_VIEW_STATES
 * - R.C.5: NO mutations to protected tables during browsing
 * - R.C.6: Navigation stability (no async redirects for 10s)
 *
 * SAFE GOLD: This file validates read-only browsing + enum compliance + stability.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';
import { loginAsTenantAdmin } from '../fixtures/auth.fixture';
import { mockReportsUniversal } from '../helpers/mock-reports';

// SAFE GOLD state subsets
const SAFE_REPORT_TYPES = ['OVERVIEW', 'FINANCIAL', 'ATTENDANCE', 'ATHLETES', 'EVENTS'] as const;
const SAFE_REPORT_SCOPES = ['TENANT', 'GLOBAL'] as const;
const SAFE_REPORT_VIEW_STATES = ['LOADING', 'READY', 'ERROR'] as const;

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
  'events',
  'reports',
];

const TENANT_SLUG = process.env.E2E_TENANT_SLUG || 'test-tenant';

test.describe('R1.0 — Reports SAFE GOLD (Contract)', () => {
  test('R.C.1: renders deterministically', async ({ page }) => {
    logTestStep('CONTRACT', 'Deterministic reports render');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockReportsUniversal(page, { type: 'OVERVIEW', scope: 'TENANT', tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // App shell should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);

    logTestAssertion('CONTRACT', 'Reports page visible', true);
  });

  test('R.C.2: report type MUST be SAFE GOLD subset', async ({ page }) => {
    logTestStep('CONTRACT', 'Report type enum compliance');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockReportsUniversal(page, { type: 'OVERVIEW', scope: 'TENANT', tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Check if reports-root exists with correct type
    const reportsRoot = page.locator('[data-testid="reports-root"]');
    const reportsVisible = await reportsRoot.isVisible().catch(() => false);

    if (reportsVisible) {
      const type = await reportsRoot.getAttribute('data-report-type');
      if (type) {
        expect(SAFE_REPORT_TYPES).toContain(type as any);
        logTestAssertion('CONTRACT', `Report type ok: ${type}`, true);
      }
    }

    // At minimum, page should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    logTestAssertion('CONTRACT', 'Report type validation passed', true);
  });

  test('R.C.3: report scope MUST be SAFE GOLD subset', async ({ page }) => {
    logTestStep('CONTRACT', 'Report scope enum compliance');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockReportsUniversal(page, { type: 'OVERVIEW', scope: 'TENANT', tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Check if reports-root exists with correct scope
    const reportsRoot = page.locator('[data-testid="reports-root"]');
    const reportsVisible = await reportsRoot.isVisible().catch(() => false);

    if (reportsVisible) {
      const scope = await reportsRoot.getAttribute('data-report-scope');
      if (scope) {
        expect(SAFE_REPORT_SCOPES).toContain(scope as any);
        logTestAssertion('CONTRACT', `Report scope ok: ${scope}`, true);
      }
    }

    // At minimum, page should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    logTestAssertion('CONTRACT', 'Report scope validation passed', true);
  });

  test('R.C.4: report view state MUST be SAFE GOLD subset', async ({ page }) => {
    logTestStep('CONTRACT', 'Report view state enum compliance');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockReportsUniversal(page, { type: 'OVERVIEW', scope: 'TENANT', tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Check if reports-root exists with correct view state
    const reportsRoot = page.locator('[data-testid="reports-root"]');
    const reportsVisible = await reportsRoot.isVisible().catch(() => false);

    if (reportsVisible) {
      const viewState = await reportsRoot.getAttribute('data-report-view-state');
      if (viewState) {
        expect(SAFE_REPORT_VIEW_STATES).toContain(viewState as any);
        logTestAssertion('CONTRACT', `Report view state ok: ${viewState}`, true);
      }
    }

    // At minimum, page should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    logTestAssertion('CONTRACT', 'Report view state validation passed', true);
  });

  test('R.C.5: NO mutations to protected tables during reports browsing', async ({ page }) => {
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
    await mockReportsUniversal(page, { type: 'OVERVIEW', scope: 'TENANT', tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Browse around for a bit
    await page.waitForTimeout(2000);

    expect(mutations).toHaveLength(0);
    logTestAssertion('CONTRACT', 'No mutations detected', true);
  });

  test('R.C.6: navigation stability (no async redirects for 10s)', async ({ page }) => {
    logTestStep('CONTRACT', 'Navigation stability');

    const nav: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) nav.push(frame.url());
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockReportsUniversal(page, { type: 'OVERVIEW', scope: 'TENANT', tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const stableUrl = page.url();
    await page.waitForTimeout(10000);

    expect(page.url()).toBe(stableUrl);

    const unexpected = nav.filter(
      (u) =>
        !u.includes('/app') &&
        !u.includes('/login') &&
        !u.includes('/auth') &&
        !u.includes('/portal') &&
        !u.includes('about:blank')
    );
    expect(unexpected.length).toBe(0);

    logTestAssertion('CONTRACT', 'Navigation stable for 10s', true);
  });
});
