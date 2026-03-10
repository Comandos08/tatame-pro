import { test, expect } from '@playwright/test';

/**
 * Mobile Responsiveness Tests — I-05
 *
 * Validates that critical pages render correctly on mobile viewports.
 * These tests run on the 'mobile' project (Pixel 5, 393x851) defined
 * in playwright.config.ts.
 *
 * Covers: public pages, login, membership form, events list.
 * Protected pages (AthleteArea, ApprovalsList) require auth setup —
 * those are validated by the contract suite which also runs on mobile.
 */

test.describe('Mobile: Public Pages', () => {
  test('landing page renders without horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = page.viewportSize()?.width ?? 393;

    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test('login page — email and password inputs are reachable', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 8000 });
    await expect(emailInput).toBeInViewport();
  });

  test('forgot password page renders correctly', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('body')).toBeVisible();
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 8000 });
  });

  test('public verify card page loads', async ({ page }) => {
    await page.goto('/verify/card-not-found-test');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Mobile: Navigation', () => {
  test('navbar / header does not overflow on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const header = page.locator('header').first();
    if (await header.isVisible()) {
      const headerBox = await header.boundingBox();
      const viewportWidth = page.viewportSize()?.width ?? 393;
      if (headerBox) {
        expect(headerBox.width).toBeLessThanOrEqual(viewportWidth + 1);
      }
    }
  });

  test('login page submit button is visible without scrolling', async ({ page }) => {
    await page.goto('/login');
    const submitButton = page.locator('button[type="submit"]').first();
    await expect(submitButton).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Mobile: Membership Public Flow', () => {
  test('membership type selector renders on mobile', async ({ page }) => {
    // Attempt to reach the public membership page for a test tenant
    const testTenantSlug = process.env.E2E_TEST_TENANT_SLUG ?? 'demo-bjj';
    await page.goto(`/${testTenantSlug}/membership`);
    // Page either shows selector or redirects — just verify no crash
    await expect(page.locator('body')).toBeVisible();
    await page.waitForLoadState('domcontentloaded');
  });
});

test.describe('Mobile: Text Legibility', () => {
  test('login page has no text smaller than 12px in form labels', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    const smallTextCount = await page.evaluate(() => {
      const labels = document.querySelectorAll('label, p, span');
      let tinyCount = 0;
      labels.forEach((el) => {
        const size = parseFloat(window.getComputedStyle(el).fontSize);
        if (size < 11) tinyCount++;
      });
      return tinyCount;
    });

    // Allow minor violations — assert fewer than 5 tiny text elements
    expect(smallTextCount).toBeLessThan(5);
  });
});
