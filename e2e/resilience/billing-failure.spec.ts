/**
 * BILLING RESILIENCE TESTS — PI B1.0
 *
 * POLICY: NEVER REMOVE
 *
 * Tests billing UI resilience under failure conditions.
 * B.R.1 - 403 Forbidden handling
 * B.R.2 - 500 Server Error handling
 * B.R.3 - Network timeout handling
 * B.R.4 - Invalid JSON handling
 * B.R.5 - Stripe unavailable handling
 */

import { test, expect } from '@playwright/test';
import { loginAsTenantAdmin } from '../fixtures/auth.fixture';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

const TENANT_SLUG = 'demo-bjj';

test.describe('Billing Resilience — PI B1.0', () => {
  test('B.R.1: 403 does not crash UI', async ({ page }) => {
    logTestStep('RESILIENCE', '403 handling');

    await freezeTime(page);

    await page.route('**/rest/v1/tenant_billing*', r => 
      r.fulfill({ 
        status: 403, 
        contentType: 'application/json', 
        body: JSON.stringify({ error: 'Forbidden' }) 
      })
    );

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
    
    // Should not show a crash/white screen
    const content = await page.textContent('body');
    expect((content || '').length).toBeGreaterThan(20);

    logTestAssertion('RESILIENCE', '403 handled gracefully', true);
  });

  test('B.R.2: 500 does not crash UI', async ({ page }) => {
    logTestStep('RESILIENCE', '500 handling');

    await freezeTime(page);

    await page.route('**/rest/v1/tenant_billing*', r => 
      r.fulfill({ 
        status: 500, 
        contentType: 'application/json', 
        body: JSON.stringify({ error: 'Internal Server Error' }) 
      })
    );

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
    
    const content = await page.textContent('body');
    expect((content || '').length).toBeGreaterThan(20);

    logTestAssertion('RESILIENCE', '500 handled gracefully', true);
  });

  test('B.R.3: timeout does not crash UI', async ({ page }) => {
    logTestStep('RESILIENCE', 'timeout handling');

    await freezeTime(page);

    await page.route('**/rest/v1/tenant_billing*', async r => {
      // Simulate 15 second timeout
      await new Promise(res => setTimeout(res, 15000));
      r.fulfill({ 
        status: 200, 
        contentType: 'application/json', 
        body: JSON.stringify([]) 
      });
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`, { timeout: 30000 });
    
    // Wait for page to at least partially load
    await page.waitForTimeout(5000);

    await expect(page.locator('body')).toBeVisible();

    logTestAssertion('RESILIENCE', 'Timeout handled gracefully', true);
  });

  test('B.R.4: invalid JSON does not crash UI', async ({ page }) => {
    logTestStep('RESILIENCE', 'invalid JSON handling');

    await freezeTime(page);

    await page.route('**/rest/v1/tenant_billing*', r => 
      r.fulfill({ 
        status: 200, 
        contentType: 'application/json', 
        body: 'not valid json {{{' 
      })
    );

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
    
    // Should not be a white screen
    const content = await page.textContent('body');
    expect((content || '').trim().length).toBeGreaterThan(10);

    logTestAssertion('RESILIENCE', 'Invalid JSON handled gracefully', true);
  });

  test('B.R.5: Stripe edge functions unavailable does not crash UI', async ({ page }) => {
    logTestStep('RESILIENCE', 'Stripe unavailable handling');

    await freezeTime(page);

    // Mock billing data as OK
    await page.route('**/rest/v1/tenant_billing*', r => 
      r.fulfill({ 
        status: 200, 
        contentType: 'application/json', 
        body: JSON.stringify([{
          id: 'test-billing',
          tenant_id: 'test-tenant',
          status: 'ACTIVE',
          plan_name: 'Growth',
          stripe_customer_id: 'cus_test',
        }]) 
      })
    );

    // But Stripe edge functions fail
    await page.route('**/functions/v1/tenant-customer-portal*', r => 
      r.fulfill({ 
        status: 503, 
        contentType: 'text/plain', 
        body: 'Service Unavailable' 
      })
    );

    await page.route('**/functions/v1/create-tenant-subscription*', r => 
      r.fulfill({ 
        status: 503, 
        contentType: 'text/plain', 
        body: 'Service Unavailable' 
      })
    );

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
    
    const content = await page.textContent('body');
    expect((content || '').length).toBeGreaterThan(20);

    logTestAssertion('RESILIENCE', 'Stripe unavailable handled gracefully', true);
  });
});
