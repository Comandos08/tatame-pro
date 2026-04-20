/**
 * 🔐 E2E Test: Routing Guards Contract
 * 
 * Validates:
 * - Unauthenticated users redirect to /login
 * - No redirect loops
 * - Consistent guard behavior
 * - Single decision hub (/portal) pattern
 */

import { test, expect } from '@playwright/test';

test.describe('Routing Guards Contract', () => {
  test.beforeEach(async ({ page }) => {
    // Clear session to start unauthenticated
    await page.context().clearCookies();
  });

  test('unauthenticated user accessing /portal redirects to /login', async ({ page }) => {
    await page.goto('/portal');
    
    // Wait for redirect
    await page.waitForURL('**/login', { timeout: 10000 });
    
    const url = page.url();
    expect(url).toContain('/login');
  });

  test('unauthenticated user accessing /admin redirects to /portal then /login', async ({ page }) => {
    await page.goto('/admin');
    
    // Should eventually reach /login (may go through /portal first)
    await page.waitForURL('**/login', { timeout: 10000 });
    
    const url = page.url();
    expect(url).toContain('/login');
  });

  test('no redirect loop on /login', async ({ page }) => {
    const navigationHistory: string[] = [];
    
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigationHistory.push(frame.url());
      }
    });
    
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    
    // Wait to catch any loops
    await page.waitForTimeout(2000);
    
    // Count how many times /login appears in history
    const loginCount = navigationHistory.filter(url => url.includes('/login')).length;
    
    // Should not redirect to login more than twice (initial + possible redirect)
    expect(loginCount).toBeLessThanOrEqual(2);
    
    // Final URL should still be login
    const finalUrl = page.url();
    expect(finalUrl).toContain('/login');
  });

  test('no redirect loop on /portal', async ({ page }) => {
    const navigationHistory: string[] = [];
    
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigationHistory.push(frame.url());
      }
    });
    
    await page.goto('/portal');
    await page.waitForLoadState('domcontentloaded');
    
    // Wait to catch any loops
    await page.waitForTimeout(2000);
    
    // Count redirects
    const portalCount = navigationHistory.filter(url => url.includes('/portal')).length;
    
    // Should not bounce back to portal multiple times
    expect(portalCount).toBeLessThanOrEqual(2);
  });

  test('URL remains stable after redirect completion', async ({ page }) => {
    await page.goto('/portal');
    
    // Wait for any redirects to complete
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    
    const urlAfterRedirect = page.url();
    
    // Wait more and check URL hasn't changed
    await page.waitForTimeout(1000);
    const urlAfterWait = page.url();
    
    expect(urlAfterWait).toBe(urlAfterRedirect);
  });

  test('protected tenant routes redirect unauthenticated users', async ({ page }) => {
    // Try to access a protected tenant app route
    await page.goto('/demo-tenant/app');
    
    // Should redirect to login or landing (tenant may not exist)
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    const url = page.url();
    
    // Should be at login, portal, or tenant landing (not the app route)
    const isProtected = url.includes('/app') && !url.includes('/login');
    expect(isProtected).toBe(false);
  });

  test('public routes are accessible without auth', async ({ page }) => {
    const publicRoutes = [
      '/',
      '/login',
      '/help',
      '/forgot-password',
    ];
    
    for (const route of publicRoutes) {
      const response = await page.goto(route);
      
      // Should not get blocked (200 or redirect to same domain)
      expect(response?.status()).toBeLessThan(400);
      
      // Should not redirect to login for already-public routes
      if (route !== '/login') {
        await page.waitForLoadState('domcontentloaded');
      }
    }
  });

  test('join wizard is accessible without auth', async ({ page }) => {
    await page.goto('/join');
    
    // Should redirect to /join/org
    await page.waitForURL('**/join/org', { timeout: 5000 });
    
    const url = page.url();
    expect(url).toContain('/join/org');
  });
});

test.describe('Guard Behavior - Edge Cases', () => {
  test('handles malformed tenant slugs gracefully', async ({ page }) => {
    // Try various malformed slugs
    const malformedSlugs = [
      '/../../admin',
      '/%00/app',
      '/undefined/app',
      '/null/portal',
    ];
    
    for (const slug of malformedSlugs) {
      await page.goto(slug);
      await page.waitForLoadState('domcontentloaded');
      
      // Should not crash - either 404 or redirect
      const url = page.url();
      expect(url).toBeTruthy();
      
      // Should not show error boundary for these cases
      const errorBoundary = page.getByTestId('error-boundary-fallback');
      const isErrorVisible = await errorBoundary.isVisible().catch(() => false);
      expect(isErrorVisible).toBe(false);
    }
  });

  test('admin route is not accessible without superadmin role', async ({ page }) => {
    await page.context().clearCookies();
    
    await page.goto('/admin');
    
    // Should redirect away from /admin
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const url = page.url();
    expect(url).not.toMatch(/\/admin$/);
  });
});
