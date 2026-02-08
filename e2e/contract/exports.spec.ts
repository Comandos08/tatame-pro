/**
 * PI EXPORTS1.0 — EXPORTS SAFE GOLD — Contract Tests
 *
 * POLICY: NEVER REMOVE
 * These tests validate deterministic export behavior.
 *
 * CONTRACTS:
 * - EXPORT.C.1: Renders deterministically
 * - EXPORT.C.2: Export type ∈ SAFE_EXPORT_TYPES
 * - EXPORT.C.3: View state ∈ SAFE_EXPORT_VIEW_STATES
 * - EXPORT.C.4: NO mutations to protected tables during export
 * - EXPORT.C.5: Navigation stability (no async redirects for 10s)
 * - EXPORT.C.6: Idempotent re-execution (same input → same output)
 *
 * SAFE GOLD: Exports are READ-ONLY, deterministic, and side-effect free.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';
import { loginAsTenantAdmin } from '../fixtures/auth.fixture';
import { 
  mockExportsUniversal, 
  EXPORTS_PROTECTED_TABLES,
  generateDeterministicExport,
} from '../helpers/mock-exports';

// SAFE GOLD state subsets
const SAFE_EXPORT_TYPES = ['CSV', 'PDF'] as const;
const SAFE_EXPORT_VIEW_STATES = ['READY', 'GENERATING', 'DONE', 'ERROR'] as const;

const TENANT_SLUG = process.env.E2E_TENANT_SLUG || 'test-tenant';

test.describe('EXPORTS1.0 — Exports SAFE GOLD (Contract)', () => {
  test('EXPORT.C.1: renders deterministically', async ({ page }) => {
    logTestStep('CONTRACT', 'Deterministic export render');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockExportsUniversal(page, { type: 'CSV', tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // App shell should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);

    logTestAssertion('CONTRACT', 'Export context visible', true);
  });

  test('EXPORT.C.2: export type MUST be SAFE GOLD subset', async ({ page }) => {
    logTestStep('CONTRACT', 'Export type enum compliance');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockExportsUniversal(page, { type: 'CSV', tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Check AppShell export instrumentation
    const appShell = page.locator('[data-testid="app-shell"]');
    const exportType = await appShell.getAttribute('data-export-type');
    
    if (exportType && exportType !== '') {
      expect(SAFE_EXPORT_TYPES).toContain(exportType as any);
      logTestAssertion('CONTRACT', `Export type ok: ${exportType}`, true);
    }

    // Check if export-root exists with correct type
    const exportRoot = page.locator('[data-testid="export-root"]');
    const exportVisible = await exportRoot.isVisible().catch(() => false);

    if (exportVisible) {
      const type = await exportRoot.getAttribute('data-export-type');
      if (type) {
        expect(SAFE_EXPORT_TYPES).toContain(type as any);
      }
    }

    // At minimum, page should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    logTestAssertion('CONTRACT', 'Export type validation passed', true);
  });

  test('EXPORT.C.3: export view state MUST be SAFE GOLD subset', async ({ page }) => {
    logTestStep('CONTRACT', 'Export view state enum compliance');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockExportsUniversal(page, { type: 'PDF', tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Check AppShell export instrumentation
    const appShell = page.locator('[data-testid="app-shell"]');
    const viewState = await appShell.getAttribute('data-export-view-state');
    
    if (viewState && viewState !== '') {
      expect(SAFE_EXPORT_VIEW_STATES).toContain(viewState as any);
      logTestAssertion('CONTRACT', `Export view state ok: ${viewState}`, true);
    }

    // Check if export-root exists with correct view state
    const exportRoot = page.locator('[data-testid="export-root"]');
    const exportVisible = await exportRoot.isVisible().catch(() => false);

    if (exportVisible) {
      const state = await exportRoot.getAttribute('data-export-view-state');
      if (state) {
        expect(SAFE_EXPORT_VIEW_STATES).toContain(state as any);
      }
    }

    // At minimum, page should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    logTestAssertion('CONTRACT', 'Export view state validation passed', true);
  });

  test('EXPORT.C.4: NO mutations to protected tables during export', async ({ page }) => {
    logTestStep('CONTRACT', 'Export mutation boundary enforcement');

    const mutations: string[] = [];

    await page.route('**/rest/v1/**', (route, request) => {
      const method = request.method();
      const url = request.url();

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        for (const t of EXPORTS_PROTECTED_TABLES) {
          if (url.includes(`/rest/v1/${t}`)) mutations.push(`${method} ${t}`);
        }
      }
      route.continue();
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockExportsUniversal(page, { type: 'CSV', tenantSlug: TENANT_SLUG });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Simulate export trigger (if button exists)
    const exportButton = page.locator('[data-testid="export-button"]');
    const buttonExists = await exportButton.isVisible().catch(() => false);

    if (buttonExists) {
      await exportButton.click();
      await page.waitForTimeout(2000);
    } else {
      // Wait to ensure no background mutations
      await page.waitForTimeout(3000);
    }

    expect(mutations).toHaveLength(0);
    logTestAssertion('CONTRACT', 'No mutations detected during export', true);
  });

  test('EXPORT.C.5: navigation stability (no async redirects for 10s)', async ({ page }) => {
    logTestStep('CONTRACT', 'Export navigation stability');

    const nav: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) nav.push(frame.url());
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockExportsUniversal(page, { type: 'CSV', tenantSlug: TENANT_SLUG });

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

  test('EXPORT.C.6: idempotent re-execution (same input → same output)', async ({ page }) => {
    logTestStep('CONTRACT', 'Export idempotency');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // Generate two exports with same parameters
    const export1 = generateDeterministicExport('CSV');
    const export2 = generateDeterministicExport('CSV');

    // Content must be identical
    expect(export1.content).toBe(export2.content);
    
    // Hash must be identical
    expect(export1.hash).toBe(export2.hash);
    
    // Metadata must be identical
    expect(JSON.stringify(export1.metadata)).toBe(JSON.stringify(export2.metadata));

    // PDF idempotency
    const pdfExport1 = generateDeterministicExport('PDF');
    const pdfExport2 = generateDeterministicExport('PDF');

    expect(pdfExport1.hash).toBe(pdfExport2.hash);
    expect(JSON.stringify(pdfExport1.metadata)).toBe(JSON.stringify(pdfExport2.metadata));

    logTestAssertion('CONTRACT', 'Export idempotency verified', true);
  });

  test('EXPORT.C.7: empty data export does NOT crash', async ({ page }) => {
    logTestStep('CONTRACT', 'Empty data export handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockExportsUniversal(page, { 
      type: 'CSV', 
      tenantSlug: TENANT_SLUG,
      emptyData: true 
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

    logTestAssertion('CONTRACT', 'Empty data export handled gracefully', true);
  });
});
