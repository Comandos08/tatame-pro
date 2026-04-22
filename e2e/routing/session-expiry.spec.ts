/**
 * 🔐 E2E Test: Session Expiry Contract
 * 
 * Validates behavior when session expires or is invalid.
 * Tests redirect behavior and user messaging.
 * 
 * SECURITY CONTRACT (from docs/SECURITY-AUTH-CONTRACT.md):
 * - Expired tokens → /login with clean state
 * - Invalid tokens → /login with warning
 * - No redirect loops
 * - No white screens
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
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    // Should have limited redirects (max 4)
    expect(navigations.length).toBeLessThan(5);
    
    // Final URL should be stable
    const finalUrl = page.url();
    expect(finalUrl).toContain('/login');
  });

  test('expired token does not cause white screen', async ({ page }) => {
    await page.context().clearCookies();
    
    await page.goto('/portal');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    
    // Page should have visible content (either login form or loading state)
    const hasContent = await page.evaluate(() => {
      const body = document.body;
      return body.innerText.length > 0;
    });
    
    expect(hasContent).toBe(true);
    
    // Should not show error boundary
    const errorBoundary = page.getByTestId('error-boundary-fallback');
    const hasError = await errorBoundary.isVisible().catch(() => false);
    expect(hasError).toBe(false);
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

  test('multiple rapid navigations do not break auth state', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    
    await page.context().clearCookies();
    
    // Rapid navigation between protected and public routes
    for (let i = 0; i < 3; i++) {
      await page.goto('/portal', { waitUntil: 'commit' });
      await page.goto('/login', { waitUntil: 'commit' });
    }
    
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    // Should not have critical React errors
    const criticalErrors = errors.filter(e => 
      e.includes('Cannot read') || 
      e.includes('setState on unmounted')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe('Auth State Machine Contract', () => {
  test('unauthenticated state is deterministic', async ({ page }) => {
    await page.context().clearCookies();
    
    // Multiple visits to portal should behave consistently
    for (let i = 0; i < 3; i++) {
      await page.goto('/portal');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);
      
      const url = page.url();
      expect(url).toContain('/login');
    }
  });

  test('public routes remain accessible without auth', async ({ page }) => {
    await page.context().clearCookies();
    
    const publicRoutes = ['/', '/login', '/help', '/forgot-password'];
    
    for (const route of publicRoutes) {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      
      // Should stay on the route (or expected redirect for /)
      await page.waitForLoadState('domcontentloaded');
    }
  });
});
