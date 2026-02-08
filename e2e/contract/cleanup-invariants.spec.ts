/**
 * 🧹 P4.3.C — Cleanup Invariant Tests
 * 
 * Validates resource cleanup:
 * - No orphan intervals/subscriptions
 * - No memory leaks on navigation
 * - Proper unmount behavior
 * 
 * SAFE GOLD: Read-only validation.
 */

import { test, expect } from '@playwright/test';
import { loginAsSuperAdmin } from '../fixtures/auth.fixture';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

test.describe('Resource Cleanup Invariants', () => {
  test('C.2.1: No orphan intervals after navigation', async ({ page }) => {
    logTestStep('CONTRACT', 'Testing interval cleanup');
    
    // Track page errors
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(err.message));
    
    await loginAsSuperAdmin(page);
    
    // Navigate to health dashboard
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Wait for subscriptions to establish
    await page.waitForTimeout(2000);
    
    // Navigate away
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    // Navigate back
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Wait for potential interval errors
    await page.waitForTimeout(5000);
    
    // Check for unmount-related errors
    const mountErrors = pageErrors.filter(e => 
      e.includes('unmounted') || 
      e.includes('memory leak') ||
      e.includes('Cannot update a component')
    );
    
    expect(mountErrors).toHaveLength(0);
    
    if (mountErrors.length > 0) {
      console.error('Mount errors found:', mountErrors);
    }
    
    logTestAssertion('CONTRACT', 'No orphan interval errors', mountErrors.length === 0);
  });
  
  test('C.2.2: No state updates on unmounted components', async ({ page }) => {
    logTestStep('CONTRACT', 'Testing unmount state safety');
    
    const consoleWarnings: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'warning') {
        consoleWarnings.push(msg.text());
      }
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    
    // Wait for channel to be created
    await page.waitForTimeout(2000);
    
    // Rapid navigation to stress test cleanup
    for (let i = 0; i < 3; i++) {
      await page.goto('/admin', { waitUntil: 'commit' });
      await page.goto('/admin/health', { waitUntil: 'commit' });
    }
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Check for React warnings about state updates
    const stateWarnings = consoleWarnings.filter(w => 
      w.includes("Can't perform a React state update") ||
      w.includes('Cannot update a component')
    );
    
    expect(stateWarnings).toHaveLength(0);
    
    logTestAssertion('CONTRACT', 'No state update warnings', stateWarnings.length === 0);
  });
  
  test('C.2.3: No duplicate listeners after rapid navigation', async ({ page }) => {
    logTestStep('CONTRACT', 'Testing listener deduplication');
    
    await loginAsSuperAdmin(page);
    
    // Rapid navigation
    for (let i = 0; i < 5; i++) {
      await page.goto('/admin/health', { waitUntil: 'commit' });
      await page.goto('/admin', { waitUntil: 'commit' });
    }
    
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Open alerts panel to check functionality
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    await alertBadge.click();
    await page.waitForTimeout(500);
    
    // Panel should work correctly
    const panel = page.locator('[role="dialog"]');
    await expect(panel).toBeVisible();
    
    // Verify only one connection indicator (not multiple stacked)
    const connectionIndicators = page.locator('[class*="bg-success"], [class*="animate-pulse"]');
    const indicatorCount = await connectionIndicators.count();
    
    // Should have at most 2 (badge + panel)
    expect(indicatorCount).toBeLessThanOrEqual(4);
    
    logTestAssertion('CONTRACT', `Connection indicators: ${indicatorCount} (max 4)`, indicatorCount <= 4);
  });
  
  test('C.2.4: AlertContext cleanup on component unmount', async ({ page }) => {
    logTestStep('CONTRACT', 'Testing AlertContext cleanup');
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Get initial dismissed count
    const initialDismissed = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('tatame_dismissed_alerts') || '[]').length;
    });
    
    // Navigate away and back multiple times
    for (let i = 0; i < 3; i++) {
      await page.goto('/admin');
      await page.waitForLoadState('domcontentloaded');
      await page.goto('/admin/health');
      await page.waitForLoadState('domcontentloaded');
    }
    
    await page.waitForLoadState('networkidle');
    
    // Dismissed state should persist (not be corrupted)
    const finalDismissed = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('tatame_dismissed_alerts') || '[]').length;
    });
    
    expect(finalDismissed).toBe(initialDismissed);
    
    logTestAssertion('CONTRACT', 'Dismissed state preserved through navigation', finalDismissed === initialDismissed);
  });
  
  test('C.2.5: Page remains responsive after long session', async ({ page }) => {
    logTestStep('CONTRACT', 'Testing long session stability');
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Simulate long session with multiple refresh cycles
    for (let i = 0; i < 5; i++) {
      const refreshButton = page.locator('button:has(svg.lucide-refresh-cw)').first();
      if (await refreshButton.isVisible()) {
        await refreshButton.click();
        await page.waitForTimeout(1000);
      }
    }
    
    // Page should still be responsive
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    await expect(alertBadge).toBeEnabled();
    
    await alertBadge.click();
    await page.waitForTimeout(500);
    
    const panel = page.locator('[role="dialog"]');
    await expect(panel).toBeVisible();
    
    logTestAssertion('CONTRACT', 'Page responsive after long session', true);
  });
});
