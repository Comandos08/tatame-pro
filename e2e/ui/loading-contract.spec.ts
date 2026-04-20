/**
 * 🔐 E2E Test: Loading Contract
 * 
 * Validates that pages don't render empty content while loading=false.
 * Ensures proper loading states and empty state fallbacks exist.
 */

import { test, expect } from '@playwright/test';

// Pages that should have loading/empty states
const PAGES_TO_TEST = [
  { path: '/', name: 'Landing Page' },
];

// Test that page doesn't show broken/empty state
test.describe('Loading Contract', () => {
  test('Landing page renders content without flash of empty', async ({ page }) => {
    await page.goto('/');
    
    // Should not have "Loading..." as only content after render
    await page.waitForLoadState('domcontentloaded');
    
    // Wait for initial render
    await page.waitForTimeout(500);
    
    // Body should have visible content
    const body = page.locator('body');
    const bodyText = await body.textContent();
    
    // Should not be completely empty
    expect(bodyText?.trim().length).toBeGreaterThan(10);
    
    // Should not show error boundary by default
    const errorBoundary = page.getByTestId('error-boundary-fallback');
    await expect(errorBoundary).not.toBeVisible();
  });

  test('Login page has form elements visible', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    
    // Form should be present
    const form = page.locator('form');
    await expect(form.first()).toBeVisible({ timeout: 5000 });
    
    // Email input should be visible
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    await expect(emailInput.first()).toBeVisible({ timeout: 5000 });
  });

  test('Help page renders without errors', async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('domcontentloaded');
    
    // Should have heading
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible({ timeout: 5000 });
    
    // Should not show error state
    const errorAlert = page.locator('[role="alert"]');
    const errorCount = await errorAlert.count();
    expect(errorCount).toBe(0);
  });

  test('Not found page renders correctly for invalid routes', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-12345');
    await page.waitForLoadState('domcontentloaded');
    
    // Should show 404 content or redirect
    await page.waitForTimeout(1000);
    
    // Either 404 page or redirected to landing
    const url = page.url();
    const is404 = await page.locator('text=/404|não encontrada|not found/i').count();
    const isLanding = url.endsWith('/');
    
    expect(is404 > 0 || isLanding).toBe(true);
  });

  test('Portal router handles unauthenticated access', async ({ page }) => {
    // Clear any existing session
    await page.context().clearCookies();
    
    await page.goto('/portal');
    await page.waitForLoadState('domcontentloaded');
    
    // Should redirect to login
    await page.waitForURL('**/login', { timeout: 5000 });
    
    const url = page.url();
    expect(url).toContain('/login');
  });
});

test.describe('Empty State Contracts', () => {
  test('Public pages should never show blank screen', async ({ page }) => {
    const publicPaths = ['/', '/login', '/help', '/forgot-password'];
    
    for (const path of publicPaths) {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(300);
      
      // Get visible text content
      const visibleText = await page.evaluate(() => {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null
        );
        let text = '';
        let node;
        while ((node = walker.nextNode())) {
          const parent = node.parentElement;
          if (parent && getComputedStyle(parent).display !== 'none') {
            text += node.textContent;
          }
        }
        return text.trim();
      });
      
      // Should have meaningful content
      expect(visibleText.length, `Path ${path} should have visible content`).toBeGreaterThan(20);
    }
  });
});
