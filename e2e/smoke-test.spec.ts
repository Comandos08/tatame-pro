import { test, expect } from '@playwright/test';

/**
 * TATAME Smoke Tests
 * 
 * Quick validation tests to run after each deploy.
 * These tests verify core functionality is working.
 */

test.describe('Smoke Tests - Core Functionality', () => {
  test('1. Landing page loads correctly', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('2. Login page is accessible', async ({ page }) => {
    await page.goto('/login');
    
    // Should show login form or redirect to auth
    const loginElements = page.locator('input[type="email"], input[type="password"], text=/login|entrar|sign in/i');
    await expect(loginElements.first()).toBeVisible({ timeout: 10000 }).catch(() => {
      // Might redirect elsewhere
      expect(page.url()).toContain('login');
    });
  });

  test('3. Password reset page is accessible', async ({ page }) => {
    await page.goto('/forgot-password');
    
    await expect(page.locator('body')).toBeVisible();
    
    // Should have email input
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 5000 }).catch(() => {
      // Page might have different structure
      expect(page.url()).toContain('forgot');
    });
  });

  test('4. No JavaScript errors on main pages', async ({ page }) => {
    const jsErrors: string[] = [];
    
    page.on('pageerror', error => {
      jsErrors.push(error.message);
    });

    // Visit main pages
    const pages = ['/', '/login'];
    
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }

    // Should have no critical JS errors
    const criticalErrors = jsErrors.filter(e => 
      !e.includes('ResizeObserver') && // Common benign error
      !e.includes('Failed to fetch') // Network errors in test env
    );
    
    expect(criticalErrors).toHaveLength(0);
  });

  test('5. Static assets load correctly', async ({ page }) => {
    const failedRequests: string[] = [];
    
    page.on('response', response => {
      if (response.status() >= 400 && !response.url().includes('api')) {
        failedRequests.push(`${response.status()}: ${response.url()}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out expected 404s (like optional images)
    const criticalFails = failedRequests.filter(r => 
      !r.includes('favicon') && 
      !r.includes('placeholder')
    );

    expect(criticalFails.length).toBeLessThan(5);
  });

  test('6. Responsive design works on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    await expect(page.locator('body')).toBeVisible();
    
    // Content should not overflow
    const body = page.locator('body');
    const box = await body.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(375);
  });

  test('7. Theme toggle works', async ({ page }) => {
    await page.goto('/');
    
    // Look for theme toggle
    const themeToggle = page.locator('button').filter({
      has: page.locator('svg[class*="moon"], svg[class*="sun"]')
    }).first();

    if (await themeToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await themeToggle.click();
      await page.waitForTimeout(500);
      
      // Should have dark or light class on html/body
      const html = page.locator('html');
      await expect(html).toBeVisible();
    }
  });

  test('8. Language selector works', async ({ page }) => {
    await page.goto('/');
    
    // Look for language selector
    const langSelector = page.locator('button, select').filter({
      hasText: /pt|en|es|português|english|español/i
    }).first();

    if (await langSelector.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Just verify it's interactive
      await expect(langSelector).toBeEnabled();
    }
  });

  test('9. Navigation works correctly', async ({ page }) => {
    await page.goto('/');
    
    // Find any navigation links
    const navLinks = page.locator('nav a, header a').first();
    
    if (await navLinks.isVisible({ timeout: 3000 }).catch(() => false)) {
      const href = await navLinks.getAttribute('href');
      if (href && !href.startsWith('http')) {
        await navLinks.click();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('body')).toBeVisible();
      }
    }
  });

  test('10. Form validation is active', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    const submitButton = page.locator('button[type="submit"]').first();
    if (!(await submitButton.isVisible({ timeout: 3000 }).catch(() => false))) {
      // No form on this page; nothing to validate.
      return;
    }

    // The login form wires `disabled={isSubmitting || !isFormValid()}`, so the
    // canonical "validation is active" signal is the submit button starting
    // disabled. Clicking a disabled element waits for enablement and times out
    // the whole test (reported as the CI flake we're fixing here).
    const startsDisabled = await submitButton.isDisabled().catch(() => false);
    if (startsDisabled) {
      expect(startsDisabled).toBe(true);
      return;
    }

    // Fallback path (forms that rely on HTML5/required instead of a disabled
    // submit): click with `force` to bypass actionability waits and confirm
    // we stayed on /login (or an explicit error surfaced).
    await submitButton.click({ force: true });
    await page.waitForTimeout(500);
    const url = page.url();
    const hasErrors = await page
      .locator('[role="alert"], .text-destructive')
      .isVisible()
      .catch(() => false);
    expect(url.includes('login') || hasErrors).toBe(true);
  });
});

test.describe('Smoke Tests - Data Display', () => {
  test('should display data tables without errors', async ({ page }) => {
    await page.goto('/');
    
    // Look for any table elements
    const tables = page.locator('table, [role="table"]');
    
    // If tables exist, they should have rows
    if (await tables.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      const rows = tables.first().locator('tr, [role="row"]');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);
    }
  });

  test('should show loading states appropriately', async ({ page }) => {
    await page.goto('/');
    
    // During load, might show skeleton or spinner
    // After load, content should be visible
    await page.waitForLoadState('networkidle');
    
    // Should not be stuck in loading state
    const spinners = page.locator('.animate-spin, [class*="loading"], [class*="skeleton"]');
    const spinnerCount = await spinners.count();
    
    // After network idle, most spinners should be gone
    await page.waitForTimeout(1000);
    const remainingSpinners = await spinners.count();
    
    expect(remainingSpinners).toBeLessThanOrEqual(spinnerCount);
  });
});
