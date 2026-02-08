/**
 * 🔌 P4.3.B — Realtime Failure Resilience Tests
 * 
 * Simulates realtime connection failures and validates
 * graceful degradation to polling fallback.
 * 
 * SAFE GOLD: No mutations, validates existing behavior.
 * Uses data-* selectors exclusively (no class-based selectors).
 */

import { test, expect, Page } from '@playwright/test';
import { loginAsSuperAdmin } from '../fixtures/auth.fixture';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

/**
 * Block ALL Supabase realtime patterns (SAFE GOLD)
 * Comprehensive coverage of WebSocket endpoints
 */
async function blockAllRealtimePatterns(page: Page): Promise<void> {
  await page.route('**/realtime/**', route => route.abort());
  await page.route('**/realtime-v1/**', route => route.abort());
  await page.route('**/realtime/v1/websocket**', route => route.abort());
  await page.route('**/.supabase.co/realtime/**', route => route.abort());
  await page.route('**/realtime-v1.websocket/**', route => route.abort());
}

test.describe('Realtime Failure Resilience', () => {
  test('B.1.1: WebSocket blocked - shows syncing/polling state', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing WebSocket blocked scenario');
    
    // Block ALL realtime patterns before navigating (SAFE GOLD)
    await blockAllRealtimePatterns(page);
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Wait for connection attempt
    await page.waitForTimeout(3000);
    
    // Use data-conn-state instead of class selectors (SAFE GOLD)
    const liveIndicator = page.locator('[data-conn-state="live"]');
    const nonLiveIndicator = page.locator('[data-conn-state="syncing"], [data-conn-state="polling"]');
    
    const liveCount = await liveIndicator.count();
    const nonLiveCount = await nonLiveIndicator.count();
    
    // With realtime blocked, should show syncing or polling, NOT live
    expect(liveCount).toBe(0);
    expect(nonLiveCount).toBeGreaterThan(0);
    
    // Page should still render normally
    await expect(page.locator('body')).toBeVisible();
    
    // UI should not crash - can still interact
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    await expect(alertBadge).toBeVisible();
    
    logTestAssertion('RESILIENCE', 'Connection shows non-live state when blocked', nonLiveCount > 0);
  });
  
  test('B.1.2: UI stable when realtime unavailable', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing UI stability without realtime');
    
    // Collect console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Block realtime (SAFE GOLD)
    await blockAllRealtimePatterns(page);
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Wait for any error handling
    await page.waitForTimeout(3000);
    
    // Page should not crash
    await expect(page.locator('body')).toBeVisible();
    
    // Should not show error boundary
    const errorBoundary = page.locator('text=/algo deu errado|something went wrong/i');
    await expect(errorBoundary).not.toBeVisible();
    
    // Open alerts panel - should work
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    await alertBadge.click();
    await page.waitForTimeout(500);
    
    // Panel should open (use role="dialog" for accessibility)
    const panel = page.locator('[role="dialog"]');
    await expect(panel).toBeVisible();
    
    // Check for critical realtime-related errors (ignore connection warnings)
    const criticalErrors = consoleErrors.filter(e => 
      e.includes('TypeError') || 
      e.includes('ReferenceError') ||
      e.includes('Cannot read properties')
    );
    
    expect(criticalErrors).toHaveLength(0);
    
    logTestAssertion('RESILIENCE', 'No critical JS errors', criticalErrors.length === 0);
  });
  
  test('B.1.3: No duplicate alerts from realtime + polling collision', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing alert deduplication');
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Wait for both realtime and polling to potentially deliver same events
    await page.waitForTimeout(6000);
    
    // Open alerts panel
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    await alertBadge.click();
    await page.waitForTimeout(500);
    
    // Get all alert IDs using data-* attribute (SAFE GOLD)
    const alertIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-alert-id]'))
        .map(el => el.getAttribute('data-alert-id'))
        .filter(Boolean);
    });
    
    // SAFE GOLD: Skip if no data
    if (alertIds.length === 0) {
      test.skip(true, 'No alerts available to check for duplicates');
      return;
    }
    
    // Check for duplicates
    const uniqueIds = new Set(alertIds);
    const hasDuplicates = alertIds.length !== uniqueIds.size;
    
    expect(hasDuplicates).toBe(false);
    
    logTestAssertion('RESILIENCE', `No duplicates in ${alertIds.length} alerts`, !hasDuplicates);
  });
  
  test('B.1.4: Connection indicator reflects actual state', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing connection indicator accuracy');
    
    // Start with realtime blocked (SAFE GOLD)
    await blockAllRealtimePatterns(page);
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Wait for connection attempt to fail
    await page.waitForTimeout(3000);
    
    // Open panel to check status
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    await alertBadge.click();
    await page.waitForTimeout(500);
    
    // Use data-conn-state for deterministic check (SAFE GOLD)
    const connState = page.locator('[data-conn-state]');
    await expect(connState.first()).toBeVisible();
    
    const state = await connState.first().getAttribute('data-conn-state');
    
    // When realtime is blocked, should NOT show "live"
    expect(state).not.toBe('live');
    expect(['syncing', 'polling']).toContain(state);
    
    logTestAssertion('RESILIENCE', `Connection state: ${state}`, true);
  });
  
  test('B.1.5: Page error handling on WebSocket failure', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing page error handling');
    
    // Track page errors
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(err.message));
    
    // Block realtime (SAFE GOLD)
    await blockAllRealtimePatterns(page);
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Navigate around to stress test cleanup
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    await page.waitForTimeout(3000);
    
    // Should not have critical page errors
    const criticalErrors = pageErrors.filter(e => 
      !e.includes('Failed to fetch') && // Network errors are expected
      !e.includes('WebSocket') // WebSocket errors are expected when blocked
    );
    
    expect(criticalErrors).toHaveLength(0);
    
    logTestAssertion('RESILIENCE', 'No unexpected page errors', criticalErrors.length === 0);
  });
  
  test('B.1.6: Polling continues when realtime blocked', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing polling fallback');
    
    let pollingRequestCount = 0;
    
    // Block realtime but track polling requests
    await blockAllRealtimePatterns(page);
    
    await page.route('**/rest/v1/observability_critical_events*', route => {
      pollingRequestCount++;
      route.continue();
    });
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Wait for polling to occur
    await page.waitForTimeout(10000);
    
    // Polling should have made requests even with realtime blocked
    expect(pollingRequestCount).toBeGreaterThan(0);
    
    logTestAssertion('RESILIENCE', `Polling made ${pollingRequestCount} requests`, pollingRequestCount > 0);
  });
});
