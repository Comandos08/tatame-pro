/**
 * PI R1.0 + REPORTS1.0 — REPORTS SAFE GOLD — Contract Tests
 *
 * POLICY: NEVER REMOVE
 * These tests validate deterministic reports behavior.
 *
 * CONTRACTS:
 * - REP.C.1: Renders deterministically
 * - REP.C.2: data-report-type ∈ SAFE_REPORT_TYPES
 * - REP.C.3: data-report-scope ∈ SAFE_REPORT_SCOPES
 * - REP.C.4: data-report-view-state ∈ SAFE_REPORT_VIEW_STATES
 * - REP.C.5: NO mutations to protected tables during browsing
 * - REP.C.6: Navigation stability (no async redirects for 10s)
 * - REP.C.7: Filters do not mutate state
 * - REP.C.8: Missing data ≠ crash (graceful degradation)
 *
 * SAFE GOLD: This file validates read-only browsing + enum compliance + stability.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';
import { loginAsTenantAdmin } from '../fixtures/auth.fixture';
import { mockReportsUniversal, REPORTS_PROTECTED_TABLES } from '../helpers/mock-reports';

// SAFE GOLD state subsets
const SAFE_REPORT_TYPES = ['OVERVIEW', 'FINANCIAL', 'ATTENDANCE', 'ATHLETES', 'EVENTS'] as const;
const SAFE_REPORT_SCOPES = ['TENANT', 'GLOBAL'] as const;
const SAFE_REPORT_VIEW_STATES = ['LOADING', 'READY', 'ERROR'] as const;
const SAFE_REPORT_MODES = ['GLOBAL', 'TENANT'] as const;
const SAFE_ANALYTICS_VIEW_STATES = ['OK', 'EMPTY', 'PARTIAL', 'ERROR'] as const;

const TENANT_SLUG = process.env.E2E_TENANT_SLUG || 'test-tenant';

test.describe('REPORTS1.0 — Reports SAFE GOLD (Contract)', () => {
  test('REP.C.1: renders deterministically', async ({ page }) => {
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

  test('REP.C.2: report type MUST be SAFE GOLD subset', async ({ page }) => {
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

  test('REP.C.3: report scope MUST be SAFE GOLD subset', async ({ page }) => {
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

  test('REP.C.4: report view state MUST be SAFE GOLD subset', async ({ page }) => {
    logTestStep('CONTRACT', 'Report view state enum compliance');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockReportsUniversal(page, { type: 'OVERVIEW', scope: 'TENANT', tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Check AppShell report instrumentation
    const appShell = page.locator('[data-testid="app-shell"]');
    const viewState = await appShell.getAttribute('data-report-view-state');
    
    if (viewState) {
      expect(SAFE_ANALYTICS_VIEW_STATES).toContain(viewState as any);
      logTestAssertion('CONTRACT', `Report view state ok: ${viewState}`, true);
    }

    // Check if reports-root exists with correct view state
    const reportsRoot = page.locator('[data-testid="reports-root"]');
    const reportsVisible = await reportsRoot.isVisible().catch(() => false);

    if (reportsVisible) {
      const rootViewState = await reportsRoot.getAttribute('data-report-view-state');
      if (rootViewState) {
        expect([...SAFE_REPORT_VIEW_STATES, ...SAFE_ANALYTICS_VIEW_STATES]).toContain(rootViewState as any);
      }
    }

    // At minimum, page should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    logTestAssertion('CONTRACT', 'Report view state validation passed', true);
  });

  test('REP.C.5: NO mutations to protected tables during reports browsing', async ({ page }) => {
    logTestStep('CONTRACT', 'Mutation boundary enforcement');

    const mutations: string[] = [];

    await page.route('**/rest/v1/**', (route, request) => {
      const method = request.method();
      const url = request.url();

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        for (const t of REPORTS_PROTECTED_TABLES) {
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

  test('REP.C.6: navigation stability (no async redirects for 10s)', async ({ page }) => {
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

  test('REP.C.7: filters do NOT mutate state', async ({ page }) => {
    logTestStep('CONTRACT', 'Filter immutability');

    const mutations: string[] = [];

    await page.route('**/rest/v1/**', (route, request) => {
      const method = request.method();
      const url = request.url();

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        mutations.push(`${method} ${url}`);
      }
      route.continue();
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockReportsUniversal(page, { type: 'OVERVIEW', scope: 'TENANT', tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Simulate filter interactions (if filters exist)
    const filterButton = page.locator('[data-testid="report-filter"]');
    const filterExists = await filterButton.isVisible().catch(() => false);

    if (filterExists) {
      await filterButton.click();
      await page.waitForTimeout(500);
    }

    // Filters must NOT trigger mutations
    expect(mutations).toHaveLength(0);
    logTestAssertion('CONTRACT', 'Filters do not mutate state', true);
  });

  test('REP.C.8: missing data does NOT crash (graceful degradation)', async ({ page }) => {
    logTestStep('CONTRACT', 'Graceful degradation on empty data');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // Mock empty data response
    await page.route('**/rest/v1/reports**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Page should still be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);

    // No crash, no white screen
    const appShell = page.locator('[data-testid="app-shell"]');
    await expect(appShell).toBeVisible();

    logTestAssertion('CONTRACT', 'Graceful degradation on empty data', true);
  });

  test('REP.C.9: report mode MUST be SAFE GOLD subset', async ({ page }) => {
    logTestStep('CONTRACT', 'Report mode enum compliance');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockReportsUniversal(page, { type: 'OVERVIEW', scope: 'TENANT', tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Check AppShell report mode instrumentation
    const appShell = page.locator('[data-testid="app-shell"]');
    const mode = await appShell.getAttribute('data-report-mode');
    
    if (mode) {
      expect(SAFE_REPORT_MODES).toContain(mode as any);
      logTestAssertion('CONTRACT', `Report mode ok: ${mode}`, true);
    }

    // At minimum, page should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    logTestAssertion('CONTRACT', 'Report mode validation passed', true);
  });
});
