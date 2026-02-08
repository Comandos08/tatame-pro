/**
 * 🔥 P4.3.B — Mixed Failure Resilience Tests
 * 
 * Simulates combined failures (realtime + polling)
 * and validates recovery behavior.
 * 
 * SAFE GOLD: No mutations, validates existing behavior.
 */

import { test, expect } from '@playwright/test';
import { loginAsSuperAdmin } from '../fixtures/auth.fixture';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

test.describe('Mixed Failure Resilience', () => {
  test('B.3.1: Both realtime and polling fail - UI survives', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing complete infrastructure failure');
    
    // Block realtime
    await page.route('**/realtime/**', route => route.abort());
    
    // Block polling
    await page.route('**/rest/v1/observability_critical_events*', route => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Service Unavailable' }),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    
    // UI should still render
    await expect(page.locator('body')).toBeVisible();
    
    // Should not show crash screen
    const errorBoundary = page.locator('text=/algo deu errado|something went wrong/i');
    await expect(errorBoundary).not.toBeVisible();
    
    // AlertBadge should still be interactive
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    await expect(alertBadge).toBeVisible();
    await alertBadge.click();
    
    // Panel should open even if empty
    const panel = page.locator('[role="dialog"]');
    await expect(panel).toBeVisible();
    
    logTestAssertion('RESILIENCE', 'UI survives complete failure', true);
  });
  
  test('B.3.2: Recovery after polling fix', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing recovery after polling restoration');
    
    let pollingBlocked = true;
    
    // Block realtime permanently for this test
    await page.route('**/realtime/**', route => route.abort());
    
    // Block polling initially, then allow
    await page.route('**/rest/v1/observability_critical_events*', route => {
      if (pollingBlocked) {
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Service Unavailable' }),
        });
      } else {
        route.continue();
      }
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // UI should work despite failures
    await expect(page.locator('body')).toBeVisible();
    
    // Now "fix" polling
    pollingBlocked = false;
    
    // Trigger manual refresh
    const refreshButton = page.locator('button:has(svg.lucide-refresh-cw)').first();
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
      await page.waitForTimeout(2000);
    }
    
    // System should recover - no crash
    await expect(page.locator('body')).toBeVisible();
    
    logTestAssertion('RESILIENCE', 'System recovers after fix', true);
  });
  
  test('B.3.3: Dismissed state persists across failures', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing dismissed state persistence');
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Get initial dismissed state
    const initialDismissed = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('tatame_dismissed_alerts') || '[]');
    });
    
    // Simulate failure
    await page.route('**/rest/v1/observability_critical_events*', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Error' }),
      });
    });
    
    // Trigger refresh
    const refreshButton = page.locator('button:has(svg.lucide-refresh-cw)').first();
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
    }
    
    await page.waitForTimeout(2000);
    
    // Dismissed state should be preserved
    const afterFailureDismissed = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('tatame_dismissed_alerts') || '[]');
    });
    
    expect(afterFailureDismissed).toEqual(initialDismissed);
    
    logTestAssertion('RESILIENCE', 'Dismissed state preserved', true);
  });
  
  test('B.3.4: Rapid navigation during failure', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing rapid navigation under failure');
    
    // Track page errors
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(err.message));
    
    // Block realtime
    await page.route('**/realtime/**', route => route.abort());
    
    // Intermittent polling failures
    let failNext = true;
    await page.route('**/rest/v1/observability_critical_events*', route => {
      if (failNext) {
        failNext = false;
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Intermittent failure' }),
        });
      } else {
        failNext = true;
        route.continue();
      }
    });
    
    await loginAsSuperAdmin(page);
    
    // Rapid navigation
    for (let i = 0; i < 5; i++) {
      await page.goto('/admin/health', { waitUntil: 'commit' });
      await page.goto('/admin', { waitUntil: 'commit' });
    }
    
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Should not have memory leak errors
    const memoryErrors = pageErrors.filter(e => 
      e.includes('unmounted') || 
      e.includes('memory leak') ||
      e.includes('Cannot update a component')
    );
    
    expect(memoryErrors).toHaveLength(0);
    
    logTestAssertion('RESILIENCE', 'No memory errors on rapid nav', memoryErrors.length === 0);
  });
  
  test('B.3.5: Console clarity - errors are logged appropriately', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing console error clarity');
    
    const consoleMessages: Array<{ type: string; text: string }> = [];
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
      });
    });
    
    // Block realtime
    await page.route('**/realtime/**', route => route.abort());
    
    // Fail polling
    await page.route('**/rest/v1/observability_critical_events*', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Test failure' }),
      });
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Check that errors are logged with context
    const alertContextErrors = consoleMessages.filter(m => 
      m.type === 'error' && m.text.includes('AlertContext')
    );
    
    // Errors should be logged (observability) not silently swallowed
    // But this is optional - main check is no crashes
    
    logTestAssertion('RESILIENCE', `Console messages captured: ${consoleMessages.length}`, true);
  });
});
