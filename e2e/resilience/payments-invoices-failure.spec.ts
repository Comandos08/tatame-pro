/**
 * PAYMENTS/INVOICES RESILIENCE TESTS — PI P1.0
 *
 * POLICY: NEVER REMOVE
 *
 * Validates that UI gracefully handles backend failures.
 * P.R.1 - 403 Forbidden
 * P.R.2 - 500 Server Error
 * P.R.3 - Network timeout
 * P.R.4 - Invalid JSON
 * P.R.5 - Stripe offline (edge function unavailable)
 */

import { test, expect } from '@playwright/test';
import { loginAsTenantAdmin } from '../fixtures/auth.fixture';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

const TENANT_SLUG = 'demo-bjj';

test.describe('Payments/Invoices Resilience — PI P1.0', () => {
  test('P.R.1: handles 403 Forbidden gracefully', async ({ page }) => {
    logTestStep('RESILIENCE', '403 Forbidden on invoices');

    await freezeTime(page);

    await page.route('**/rest/v1/tenant_invoices*', route => {
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Forbidden' }),
      });
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    // Page should still be visible (no white screen)
    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    const bodyText = await body.textContent();
    expect(bodyText?.length).toBeGreaterThan(10);

    logTestAssertion('RESILIENCE', '403 handled - UI visible', true);
  });

  test('P.R.2: handles 500 Server Error gracefully', async ({ page }) => {
    logTestStep('RESILIENCE', '500 Server Error on invoices');

    await freezeTime(page);

    await page.route('**/rest/v1/tenant_invoices*', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    const bodyText = await body.textContent();
    expect(bodyText?.length).toBeGreaterThan(20);

    logTestAssertion('RESILIENCE', '500 handled - UI visible', true);
  });

  test('P.R.3: handles network timeout gracefully', async ({ page }) => {
    logTestStep('RESILIENCE', 'Network timeout on invoices');

    await freezeTime(page);

    await page.route('**/rest/v1/tenant_invoices*', async route => {
      // Simulate 15s delay (timeout)
      await new Promise(resolve => setTimeout(resolve, 15000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    
    // Wait for page to stabilize (may show loading state)
    await page.waitForTimeout(3000);

    const body = page.locator('body');
    await expect(body).toBeVisible();

    logTestAssertion('RESILIENCE', 'Timeout handled - UI visible', true);
  });

  test('P.R.4: handles invalid JSON gracefully', async ({ page }) => {
    logTestStep('RESILIENCE', 'Invalid JSON on invoices');

    await freezeTime(page);

    await page.route('**/rest/v1/tenant_invoices*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{ invalid json !!!',
      });
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    // No white screen
    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    const bodyText = await body.textContent();
    expect(bodyText?.length).toBeGreaterThan(10);

    logTestAssertion('RESILIENCE', 'Invalid JSON handled - no white screen', true);
  });

  test('P.R.5: handles Stripe offline gracefully', async ({ page }) => {
    logTestStep('RESILIENCE', 'Stripe edge functions unavailable');

    await freezeTime(page);

    // Mock Stripe-related edge functions as unavailable
    await page.route('**/functions/v1/create-tenant-subscription*', route => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Service Unavailable' }),
      });
    });

    await page.route('**/functions/v1/tenant-customer-portal*', route => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Service Unavailable' }),
      });
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    // Page should still render with fallback UI
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Should show billing page content
    const billingRoot = page.locator('[data-testid="billing-root"]');
    const visible = await billingRoot.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (visible) {
      logTestAssertion('RESILIENCE', 'Stripe offline - billing root visible', true);
    } else {
      // Fallback: body should have content
      const bodyText = await body.textContent();
      expect(bodyText?.length).toBeGreaterThan(10);
      logTestAssertion('RESILIENCE', 'Stripe offline - fallback UI shown', true);
    }
  });

  test('P.R.6: no redirects during failures', async ({ page }) => {
    logTestStep('RESILIENCE', 'No redirects during failures');

    const navigations: string[] = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        navigations.push(frame.url());
      }
    });

    await freezeTime(page);

    // Simulate total failure
    await page.route('**/rest/v1/tenant_invoices*', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Total failure' }),
      });
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    const initialUrl = page.url();
    await page.waitForTimeout(5000);

    // Should not have redirected away from billing
    const unexpectedRedirects = navigations.filter(url => 
      !url.includes('/billing') && 
      !url.includes('/app') && 
      !url.includes('/login') &&
      !url.includes('about:blank')
    );

    expect(unexpectedRedirects.length).toBe(0);
    expect(page.url()).toBe(initialUrl);

    logTestAssertion('RESILIENCE', 'No redirects during failures', true);
  });
});
