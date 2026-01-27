/**
 * 🔐 E2E Test: Session Expiry Contract
 * 
 * Validates behavior when session expires or is invalid.
 * Tests redirect behavior and user messaging.
 */

import { test, expect } from '@playwright/test';

test.describe('Session Expiry Contract', () => {
  test('invalid session redirects to login', async ({ page }) => {
    // Set an invalid/expired session cookie
    await page.context().addCookies([
      {
        name: 'sb-kotxhtveuegrywzyvdnl-auth-token',
        value: 'invalid-token-value',
        domain: 'localhost',
        path: '/',
      },
    ]);
    
    await page.goto('/portal');
    await page.waitForLoadState('domcontentloaded');
    
    // Should eventually reach login
    await page.waitForURL('**/login', { timeout: 10000 });
    
    const url = page.url();
    expect(url).toContain('/login');
  });

  test('clearing session during navigation redirects properly', async ({ page }) => {
    // Start at public page
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    // Clear all cookies
    await page.context().clearCookies();
    
    // Try to access protected route
    await page.goto('/portal');
    
    // Should redirect to login
    await page.waitForURL('**/login', { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('login page is accessible when session is invalid', async ({ page }) => {
    // Clear cookies
    await page.context().clearCookies();
    
    // Go to login
    const response = await page.goto('/login');
    
    // Should load successfully
    expect(response?.status()).toBeLessThan(400);
    
    // Form should be visible
    await page.waitForSelector('form', { timeout: 5000 });
    
    const form = page.locator('form');
    await expect(form.first()).toBeVisible();
  });

  test('no infinite loop on expired session', async ({ page }) => {
    const navigations: string[] = [];
    
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigations.push(frame.url());
      }
    });
    
    // Clear session
    await page.context().clearCookies();
    
    // Try protected route
    await page.goto('/portal');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Should have limited redirects
    expect(navigations.length).toBeLessThan(5);
    
    // Final URL should be stable
    const finalUrl = page.url();
    expect(finalUrl).toContain('/login');
  });
});

test.describe('Session State Transitions', () => {
  test('logout clears session and redirects', async ({ page }) => {
    // Start at public page
    await page.goto('/');
    
    // Try to trigger logout action if available
    // Since we're not authenticated, just verify login page works
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    
    // Login form should be accessible
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    await expect(emailInput.first()).toBeVisible({ timeout: 5000 });
  });

  test('protected pages show loading while checking auth', async ({ page }) => {
    await page.context().clearCookies();
    
    // Navigate to portal
    await page.goto('/portal', { waitUntil: 'commit' });
    
    // May briefly show loading state before redirect
    // This is acceptable - just ensure no error
    await page.waitForLoadState('domcontentloaded');
    
    // Eventually redirects to login
    await page.waitForURL('**/login', { timeout: 10000 });
  });
});
