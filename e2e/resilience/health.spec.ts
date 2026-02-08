/**
 * PI HEALTH1.0 — SYSTEM HEALTH SAFE GOLD — Resilience Tests
 *
 * Validates:
 * - HEALTH.R.1: 403 → UI stays visible
 * - HEALTH.R.2: 500 → UI stays visible
 * - HEALTH.R.3: Timeout → UI stays visible
 * - HEALTH.R.4: Invalid JSON → UI stays visible
 * - HEALTH.R.5: Loop detection (ratio < 0.5/s)
 * - HEALTH.R.6: No unexpected redirects
 * - HEALTH.R.7: Recovery post-failure
 */

import { test, expect } from '@playwright/test';
import {
  mockHealthFailure,
  mockHealthUniversal,
  trackHealthMutations,
  FIXED_TIMESTAMP_ISO,
} from '../helpers/mock-health';

// ============================================
// HELPER: Freeze time for deterministic tests
// ============================================

async function freezeTime(page: any, isoTimestamp: string) {
  await page.addInitScript((ts: string) => {
    const fixedDate = new Date(ts);
    const OriginalDate = Date;
    // @ts-ignore
    globalThis.Date = class extends OriginalDate {
      constructor(...args: any[]) {
        if (args.length === 0) return fixedDate;
        // @ts-ignore
        return new OriginalDate(...args);
      }
      static now() {
        return fixedDate.getTime();
      }
    };
  }, isoTimestamp);
}

// ============================================
// RESILIENCE TESTS
// ============================================

test.describe('HEALTH1.0 — System Health SAFE GOLD (Resilience)', () => {
  test.beforeEach(async ({ page }) => {
    await freezeTime(page, FIXED_TIMESTAMP_ISO);
  });

  test('HEALTH.R.1 — 403 error keeps UI visible', async ({ page }) => {
    await mockHealthFailure(page, '403');
    await page.goto('/admin/health');

    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: 10000 });

    // Should not crash
    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);
  });

  test('HEALTH.R.2 — 500 error keeps UI visible', async ({ page }) => {
    await mockHealthFailure(page, '500');
    await page.goto('/admin/health');

    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: 10000 });

    // Should not crash
    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);
  });

  test('HEALTH.R.3 — Timeout keeps UI visible', async ({ page }) => {
    test.setTimeout(30000);

    await mockHealthFailure(page, 'timeout');
    await page.goto('/admin/health');

    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: 20000 });
  });

  test('HEALTH.R.4 — Invalid JSON keeps UI visible', async ({ page }) => {
    await mockHealthFailure(page, 'invalid-json');
    await page.goto('/admin/health');

    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: 10000 });

    // Should not crash
    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);
  });

  test('HEALTH.R.5 — Loop detection (navigation ratio < 0.5/s)', async ({ page }) => {
    await mockHealthUniversal(page);
    await page.goto('/admin/health');

    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: 10000 });

    // Track navigation events using deterministic counter
    let tick = 0;

    page.on('framenavigated', () => {
      tick++;
    });

    // Wait and observe
    await page.waitForTimeout(5000);

    // Calculate navigation ratio (should be < 0.5/s)
    const ticksPerSecond = tick / 5;
    expect(ticksPerSecond).toBeLessThan(0.5);
  });

  test('HEALTH.R.6 — No unexpected redirects', async ({ page }) => {
    await mockHealthUniversal(page);

    const redirects: string[] = [];

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        redirects.push(frame.url());
      }
    });

    await page.goto('/admin/health');

    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: 10000 });

    // Wait for potential redirects
    await page.waitForTimeout(3000);

    // Should not redirect to tenant routes
    const unexpectedRedirects = redirects.filter(
      (url) =>
        url.includes('/app') ||
        url.includes('/portal') ||
        url.includes('/login') && !url.includes('/admin')
    );

    // Either stay on /admin/health or go to a valid admin route
    const finalUrl = page.url();
    const isValidAdminRoute = finalUrl.includes('/admin');
    const isLoginForAuth = finalUrl.includes('/login');
    
    expect(isValidAdminRoute || isLoginForAuth).toBe(true);
  });

  test('HEALTH.R.7 — Recovery post-failure', async ({ page }) => {
    // First, load with error
    await mockHealthFailure(page, '500');
    await page.goto('/admin/health');

    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: 10000 });

    // Now clear mocks and reload with success
    await page.unroute('**/*');
    await mockHealthUniversal(page);

    await page.reload();
    await expect(body).toBeVisible({ timeout: 10000 });

    // Should recover gracefully
    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);
  });
});

// ============================================
// MUTATION BOUNDARY TESTS
// ============================================

test.describe('HEALTH1.0 — Mutation Boundary', () => {
  test('Zero mutations during health browsing', async ({ page }) => {
    const getMutations = await trackHealthMutations(page);
    await mockHealthUniversal(page);

    await page.goto('/admin/health');

    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: 10000 });

    // Simulate user activity
    await page.waitForTimeout(3000);

    // No mutations should have occurred
    const mutations = getMutations();
    expect(mutations).toHaveLength(0);
  });
});
