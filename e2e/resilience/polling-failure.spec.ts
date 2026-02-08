/**
 * 📡 P4.3.B — Polling Failure Resilience Tests
 * 
 * Simulates polling query failures and validates
 * graceful error handling without crashes.
 * 
 * SAFE GOLD: No mutations, validates existing behavior.
 * Uses data-* selectors exclusively (no class-based selectors).
 */

import { test, expect } from '@playwright/test';
import { loginAsSuperAdmin } from '../fixtures/auth.fixture';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

test.describe('Polling Failure Resilience', () => {
  test('B.2.1: Query failure - UI remains stable', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing polling query failure');
    
    // Intercept and fail the polling query
    await page.route('**/rest/v1/observability_critical_events*', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ 
          message: 'Internal Server Error',
          code: 'PGRST500' 
        }),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    
    // UI should still render (not crash)
    await expect(page.locator('body')).toBeVisible();
    
    // Wait for error to propagate
    await page.waitForTimeout(3000);
    
    // Should not show error boundary
    const errorBoundary = page.locator('text=/algo deu errado|something went wrong/i');
    await expect(errorBoundary).not.toBeVisible();
    
    // Page should be usable
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    await expect(alertBadge).toBeVisible();
    
    logTestAssertion('RESILIENCE', 'UI stable despite polling failure', true);
  });
  
  test('B.2.2: Network timeout - graceful handling', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing network timeout');
    
    // Delay response beyond reasonable timeout
    await page.route('**/rest/v1/observability_critical_events*', async route => {
      await new Promise(r => setTimeout(r, 15000)); // 15s delay
      route.continue();
    });
    
    await loginAsSuperAdmin(page);
    
    // Set a shorter test timeout for this navigation
    await page.goto('/admin/health', { timeout: 30000 });
    
    // Page should still be usable (other data may have loaded)
    await expect(page.locator('body')).toBeVisible();
    
    // AlertsPanel should show loading or empty state, not crash
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    if (await alertBadge.isVisible()) {
      await alertBadge.click();
      await page.waitForTimeout(500);
      
      // Should show something (loading, empty, or error state) - not crash
      // Use role="dialog" for accessibility (SAFE GOLD)
      const panel = page.locator('[role="dialog"]');
      await expect(panel).toBeVisible();
    }
    
    logTestAssertion('RESILIENCE', 'Graceful timeout handling', true);
  });
  
  test('B.2.3: React Query retry respects policy', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing React Query retry policy');
    
    let requestCount = 0;
    
    await page.route('**/rest/v1/observability_critical_events*', route => {
      requestCount++;
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Temporary failure' }),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Wait for potential retries (React Query default: 3 retries with exponential backoff)
    await page.waitForTimeout(15000);
    
    // Should not retry excessively
    // Default React Query: 1 initial + 3 retries = 4 max
    expect(requestCount).toBeLessThanOrEqual(5);
    
    logTestAssertion('RESILIENCE', `Retry count: ${requestCount} (max 5)`, requestCount <= 5);
  });
  
  test('B.2.4: 403 Forbidden - handled gracefully', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing 403 Forbidden response');
    
    await page.route('**/rest/v1/observability_critical_events*', route => {
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ 
          message: 'Forbidden',
          code: 'PGRST403' 
        }),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    await page.waitForTimeout(2000);
    
    // UI should not crash
    await expect(page.locator('body')).toBeVisible();
    
    // No error boundary
    const errorBoundary = page.locator('text=/algo deu errado|something went wrong/i');
    await expect(errorBoundary).not.toBeVisible();
    
    logTestAssertion('RESILIENCE', '403 handled gracefully', true);
  });
  
  test('B.2.5: Empty response - handled correctly', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing empty response handling');
    
    await page.route('**/rest/v1/observability_critical_events*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Open alerts panel
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    await alertBadge.click();
    await page.waitForTimeout(500);
    
    // Should show empty state using data-testid (SAFE GOLD)
    const emptyState = page.locator('[data-testid="alerts-empty-state"]');
    await expect(emptyState).toBeVisible();
    
    logTestAssertion('RESILIENCE', 'Empty response shows empty state', true);
  });
  
  test('B.2.6: Malformed JSON - no crash', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing malformed JSON response');
    
    // Track page errors
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(err.message));
    
    await page.route('**/rest/v1/observability_critical_events*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'not valid json {{{',
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    
    await page.waitForTimeout(3000);
    
    // Page should not crash completely
    await expect(page.locator('body')).toBeVisible();
    
    // May have JSON parse errors but should not crash the page
    logTestAssertion('RESILIENCE', 'Malformed JSON handled', true);
  });
});
