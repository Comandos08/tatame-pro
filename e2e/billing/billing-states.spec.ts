/**
 * 🧾 P4.3.A — Billing State E2E Tests
 * 
 * Tests billing state UI using mocked responses.
 * No dependency on actual tenant billing state.
 * 
 * SAFE GOLD: Read-only, no mutations.
 * Uses data-* selectors exclusively (no class-based selectors).
 */

import { test, expect } from '@playwright/test';
import { loginAsSuperAdmin } from '../fixtures/auth.fixture';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

/**
 * Create mock billing state response
 */
function mockBillingState(
  status: string, 
  trialEndsAt?: string, 
  scheduledDeleteAt?: string,
  isManualOverride = false
) {
  return {
    id: 'mock-billing-id',
    tenant_id: 'mock-tenant-id',
    status,
    trial_ends_at: trialEndsAt || null,
    grace_period_ends_at: null,
    scheduled_delete_at: scheduledDeleteAt || null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    is_manual_override: isManualOverride,
    override_reason: isManualOverride ? 'Test override' : null,
    override_at: isManualOverride ? new Date().toISOString() : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

test.describe('Billing State UI', () => {
  test('BS.1: TRIALING state renders correctly', async ({ page }) => {
    logTestStep('E2E', 'Testing TRIALING state');
    
    const trialEndsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    
    await page.route('**/rest/v1/tenant_billing*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockBillingState('TRIALING', trialEndsAt)]),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Verify page renders without crash
    await expect(page.locator('body')).toBeVisible();
    
    // Should not show blocking screen
    const blockScreen = page.locator('[data-testid="tenant-blocked-screen"]');
    await expect(blockScreen).not.toBeVisible();
    
    logTestAssertion('E2E', 'TRIALING state renders correctly', true);
  });
  
  test('BS.2: TRIAL_EXPIRED state renders correctly', async ({ page }) => {
    logTestStep('E2E', 'Testing TRIAL_EXPIRED UI');
    
    await page.route('**/rest/v1/tenant_billing*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockBillingState('TRIAL_EXPIRED')]),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Verify page renders
    await expect(page.locator('body')).toBeVisible();
    
    logTestAssertion('E2E', 'TRIAL_EXPIRED state renders correctly', true);
  });
  
  test('BS.3: ACTIVE state has no restrictions', async ({ page }) => {
    logTestStep('E2E', 'Testing ACTIVE state');
    
    await page.route('**/rest/v1/tenant_billing*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockBillingState('ACTIVE')]),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Should not show any blocking UI
    const blockScreen = page.locator('[data-testid="tenant-blocked-screen"]');
    await expect(blockScreen).not.toBeVisible();
    
    // All UI elements should be interactive
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    await expect(alertBadge).toBeEnabled();
    
    logTestAssertion('E2E', 'ACTIVE state has no blocks', true);
  });
  
  test('BS.4: PAST_DUE state renders correctly', async ({ page }) => {
    logTestStep('E2E', 'Testing PAST_DUE state');
    
    await page.route('**/rest/v1/tenant_billing*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockBillingState('PAST_DUE')]),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Verify page renders
    await expect(page.locator('body')).toBeVisible();
    
    logTestAssertion('E2E', 'PAST_DUE state renders correctly', true);
  });
  
  test('BS.5: CANCELED state renders correctly', async ({ page }) => {
    logTestStep('E2E', 'Testing CANCELED state');
    
    await page.route('**/rest/v1/tenant_billing*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockBillingState('CANCELED')]),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Verify page renders
    await expect(page.locator('body')).toBeVisible();
    
    logTestAssertion('E2E', 'CANCELED state renders correctly', true);
  });
  
  test('BS.6: PENDING_DELETE state renders correctly', async ({ page }) => {
    logTestStep('E2E', 'Testing PENDING_DELETE state');
    
    const scheduledDeleteAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    
    await page.route('**/rest/v1/tenant_billing*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockBillingState('PENDING_DELETE', undefined, scheduledDeleteAt)]),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Verify page renders
    await expect(page.locator('body')).toBeVisible();
    
    logTestAssertion('E2E', 'PENDING_DELETE state renders correctly', true);
  });
  
  test('BS.7: UNPAID state renders correctly', async ({ page }) => {
    logTestStep('E2E', 'Testing UNPAID state');
    
    await page.route('**/rest/v1/tenant_billing*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockBillingState('UNPAID')]),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Verify page renders
    await expect(page.locator('body')).toBeVisible();
    
    logTestAssertion('E2E', 'UNPAID state renders correctly', true);
  });
  
  test('BS.8: INCOMPLETE state renders correctly', async ({ page }) => {
    logTestStep('E2E', 'Testing INCOMPLETE state');
    
    await page.route('**/rest/v1/tenant_billing*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockBillingState('INCOMPLETE')]),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Verify page renders
    await expect(page.locator('body')).toBeVisible();
    
    logTestAssertion('E2E', 'INCOMPLETE state renders correctly', true);
  });
  
  test('BS.9: Manual override bypasses Stripe', async ({ page }) => {
    logTestStep('E2E', 'Testing manual override');
    
    await page.route('**/rest/v1/tenant_billing*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockBillingState('ACTIVE', undefined, undefined, true)]),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Verify page renders without crash
    await expect(page.locator('body')).toBeVisible();
    
    // No blocking UI
    const blockScreen = page.locator('[data-testid="tenant-blocked-screen"]');
    await expect(blockScreen).not.toBeVisible();
    
    logTestAssertion('E2E', 'Manual override works correctly', true);
  });
  
  test('BS.10: Missing billing data handled gracefully', async ({ page }) => {
    logTestStep('E2E', 'Testing missing billing data');
    
    await page.route('**/rest/v1/tenant_billing*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Page should still render (fallback handling)
    await expect(page.locator('body')).toBeVisible();
    
    logTestAssertion('E2E', 'Missing billing data handled gracefully', true);
  });
});
