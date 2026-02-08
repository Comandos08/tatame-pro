/**
 * PI A1.0 — ADMIN CONSOLE SAFE GOLD v1.0 — Resilience Tests
 *
 * POLICY: NEVER REMOVE
 * These tests validate graceful degradation when admin endpoints fail.
 *
 * CONTRACTS:
 * - A.R.1: 403 error — UI stays visible
 * - A.R.2: 500 error — UI stays visible
 * - A.R.3: Timeout — UI stays visible
 * - A.R.4: Invalid JSON — UI stays visible
 *
 * SAFE GOLD: Failures must NEVER cause white-screen or forced redirects.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';
import { loginAsSuperAdmin } from '../fixtures/auth.fixture';
import { mockAdminConsoleFailure } from '../helpers/mock-admin-console';

const TENANT_SLUG = process.env.E2E_TENANT_SLUG || 'test-tenant';

test.describe('A1.0 — Admin Console SAFE GOLD (Resilience)', () => {
  test('A.R.1: 403 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', '403 handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAdminConsoleFailure(page, '403');

    await loginAsSuperAdmin(page);
    await page.goto('/admin');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 403', true);
  });

  test('A.R.2: 500 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', '500 handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAdminConsoleFailure(page, '500');

    await loginAsSuperAdmin(page);
    await page.goto('/admin');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 500', true);
  });

  test('A.R.3: timeout — UI stays visible', async ({ page }) => {
    test.setTimeout(30000);
    logTestStep('RESILIENCE', 'timeout handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAdminConsoleFailure(page, 'timeout');

    await loginAsSuperAdmin(page);
    await page.goto('/admin');
    await page.waitForTimeout(5000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after timeout', true);
  });

  test('A.R.4: invalid JSON — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'invalid JSON handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAdminConsoleFailure(page, 'invalid-json');

    await loginAsSuperAdmin(page);
    await page.goto('/admin');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after invalid JSON', true);
  });
});
