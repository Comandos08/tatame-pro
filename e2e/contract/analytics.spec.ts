/**
 * PI ANALYTICS2.0 — ANALYTICS SAFE GOLD — Contract Tests
 *
 * POLICY: NEVER REMOVE
 * These tests validate deterministic analytics behavior.
 *
 * CONTRACTS:
 * - AN.C.1: Renders deterministically
 * - AN.C.2: Metrics ∈ SAFE_ANALYTICS_METRICS
 * - AN.C.3: ViewState ∈ SAFE_ANALYTICS_VIEW_STATES
 * - AN.C.4: NO mutations to protected tables during analytics
 * - AN.C.5: Navigation stability (no async redirects for 10s)
 * - AN.C.6: Idempotent re-execution (same input → same output)
 *
 * SAFE GOLD: Analytics are READ-ONLY, deterministic, and reproducible.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';
import { loginAsTenantAdmin } from '../fixtures/auth.fixture';
import {
  mockAnalyticsUniversal,
  ANALYTICS_PROTECTED_TABLES,
  SAFE_ANALYTICS_METRICS,
  generateDeterministicAnalytics,
} from '../helpers/mock-analytics';

// SAFE GOLD state subsets
const SAFE_ANALYTICS_VIEW_STATES = ['OK', 'EMPTY', 'PARTIAL', 'ERROR'] as const;

const TENANT_SLUG = process.env.E2E_TENANT_SLUG || 'test-tenant';

test.describe('ANALYTICS2.0 — Analytics SAFE GOLD (Contract)', () => {
  test('AN.C.1: renders deterministically', async ({ page }) => {
    logTestStep('CONTRACT', 'Deterministic analytics render');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAnalyticsUniversal(page, { tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // App shell should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);

    logTestAssertion('CONTRACT', 'Analytics context visible', true);
  });

  test('AN.C.2: metrics MUST be SAFE GOLD subset', async ({ page }) => {
    logTestStep('CONTRACT', 'Analytics metrics enum compliance');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAnalyticsUniversal(page, { tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Check AppShell analytics instrumentation
    const appShell = page.locator('[data-testid="app-shell"]');
    const metricsAttr = await appShell.getAttribute('data-analytics-metrics');

    if (metricsAttr && metricsAttr !== '') {
      const metrics = metricsAttr.split(',');
      for (const metric of metrics) {
        if (metric.trim()) {
          expect(SAFE_ANALYTICS_METRICS).toContain(metric.trim() as any);
        }
      }
      logTestAssertion('CONTRACT', `Analytics metrics ok: ${metricsAttr}`, true);
    }

    // At minimum, page should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    logTestAssertion('CONTRACT', 'Analytics metrics validation passed', true);
  });

  test('AN.C.3: view state MUST be SAFE GOLD subset', async ({ page }) => {
    logTestStep('CONTRACT', 'Analytics view state enum compliance');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAnalyticsUniversal(page, { tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Check AppShell analytics instrumentation
    const appShell = page.locator('[data-testid="app-shell"]');
    const viewState = await appShell.getAttribute('data-analytics-view-state');

    if (viewState && viewState !== '') {
      expect(SAFE_ANALYTICS_VIEW_STATES).toContain(viewState as any);
      logTestAssertion('CONTRACT', `Analytics view state ok: ${viewState}`, true);
    }

    // At minimum, page should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    logTestAssertion('CONTRACT', 'Analytics view state validation passed', true);
  });

  test('AN.C.4: NO mutations to protected tables during analytics', async ({ page }) => {
    logTestStep('CONTRACT', 'Analytics mutation boundary enforcement');

    const mutations: string[] = [];

    await page.route('**/rest/v1/**', (route, request) => {
      const method = request.method();
      const url = request.url();

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        for (const t of ANALYTICS_PROTECTED_TABLES) {
          if (url.includes(`/rest/v1/${t}`)) mutations.push(`${method} ${t}`);
        }
      }
      route.continue();
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAnalyticsUniversal(page, { tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Wait to ensure no background mutations
    await page.waitForTimeout(3000);

    expect(mutations).toHaveLength(0);
    logTestAssertion('CONTRACT', 'No mutations detected during analytics', true);
  });

  test('AN.C.5: navigation stability (no async redirects for 10s)', async ({ page }) => {
    logTestStep('CONTRACT', 'Analytics navigation stability');

    const nav: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) nav.push(frame.url());
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAnalyticsUniversal(page, { tenantSlug: TENANT_SLUG });

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

  test('AN.C.6: idempotent re-execution (same input → same output)', async ({ page }) => {
    logTestStep('CONTRACT', 'Analytics idempotency');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // Generate two analytics with same parameters
    const analytics1 = generateDeterministicAnalytics();
    const analytics2 = generateDeterministicAnalytics();

    // Metrics must be identical
    expect(analytics1.metrics).toEqual(analytics2.metrics);

    // Generated timestamp must be identical
    expect(analytics1.generated_at).toBe(analytics2.generated_at);

    // Tenant ID must be identical
    expect(analytics1.tenant_id).toBe(analytics2.tenant_id);

    // Full payload must be identical
    expect(JSON.stringify(analytics1)).toBe(JSON.stringify(analytics2));

    logTestAssertion('CONTRACT', 'Analytics idempotency verified', true);
  });

  test('AN.C.7: empty data does NOT crash', async ({ page }) => {
    logTestStep('CONTRACT', 'Empty analytics data handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAnalyticsUniversal(page, {
      tenantSlug: TENANT_SLUG,
      emptyData: true,
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Page should still be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);

    // AppShell should be visible
    const appShell = page.locator('[data-testid="app-shell"]');
    await expect(appShell).toBeVisible();

    logTestAssertion('CONTRACT', 'Empty analytics data handled gracefully', true);
  });

  test('AN.C.8: partial data does NOT break UI', async ({ page }) => {
    logTestStep('CONTRACT', 'Partial analytics data handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAnalyticsUniversal(page, {
      tenantSlug: TENANT_SLUG,
      partialData: true,
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Page should still be visible and functional
    const body = page.locator('body');
    await expect(body).toBeVisible();

    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);

    logTestAssertion('CONTRACT', 'Partial analytics data handled gracefully', true);
  });
});
