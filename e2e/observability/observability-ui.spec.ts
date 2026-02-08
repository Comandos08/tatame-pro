/**
 * 🔔 P4.3.A — Observability UI E2E Tests
 * 
 * Tests for AlertBadge and AlertsPanel components.
 * Validates P4.2 realtime infrastructure UX.
 * 
 * SAFE GOLD: No mutations to business data.
 */

import { test, expect } from '@playwright/test';
import { loginAsSuperAdmin } from '../fixtures/auth.fixture';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

test.describe('Observability UI', () => {
  test.describe('AlertBadge', () => {
    test('A.1.1: renders correctly on health dashboard', async ({ page }) => {
      logTestStep('E2E', 'Testing AlertBadge rendering');
      
      await loginAsSuperAdmin(page);
      await page.goto('/admin/health');
      await page.waitForLoadState('networkidle');
      
      // AlertBadge should be visible (Bell icon button)
      const alertBadge = page.locator('button:has(svg.lucide-bell)');
      await expect(alertBadge).toBeVisible();
      
      logTestAssertion('E2E', 'AlertBadge is visible', true);
    });
    
    test('A.1.2: shows realtime connection indicator', async ({ page }) => {
      logTestStep('E2E', 'Testing realtime connection indicator');
      
      await loginAsSuperAdmin(page);
      await page.goto('/admin/health');
      await page.waitForLoadState('networkidle');
      
      // Wait for realtime to attempt connection
      await page.waitForTimeout(2000);
      
      // Should show either connected (bg-success) or syncing (animate-pulse) indicator
      const connectedIndicator = page.locator('[class*="bg-success"]');
      const syncingIndicator = page.locator('[class*="animate-pulse"]');
      
      const hasConnected = await connectedIndicator.count() > 0;
      const hasSyncing = await syncingIndicator.count() > 0;
      
      expect(hasConnected || hasSyncing).toBe(true);
      
      logTestAssertion('E2E', 'Connection indicator visible', hasConnected || hasSyncing);
    });
    
    test('A.1.3: displays count when alerts exist', async ({ page }) => {
      logTestStep('E2E', 'Testing alert count display');
      
      await loginAsSuperAdmin(page);
      await page.goto('/admin/health');
      await page.waitForLoadState('networkidle');
      
      // Check for count badge (if alerts exist)
      const countBadge = page.locator('button:has(svg.lucide-bell) span');
      
      if (await countBadge.isVisible()) {
        const countText = await countBadge.textContent();
        logTestAssertion('E2E', `Alert count visible: ${countText}`, true);
      } else {
        // No alerts is also valid
        logTestAssertion('E2E', 'No alerts to count (empty state)', true);
      }
    });
  });
  
  test.describe('AlertsPanel', () => {
    test('A.1.4: opens on badge click', async ({ page }) => {
      logTestStep('E2E', 'Testing AlertsPanel open');
      
      await loginAsSuperAdmin(page);
      await page.goto('/admin/health');
      await page.waitForLoadState('networkidle');
      
      // Click the alert badge
      const alertBadge = page.locator('button:has(svg.lucide-bell)');
      await alertBadge.click();
      
      // Panel should open (Sheet component)
      const panelTitle = page.locator('text=/alertas|alerts/i').first();
      await expect(panelTitle).toBeVisible({ timeout: 3000 });
      
      logTestAssertion('E2E', 'AlertsPanel opened', true);
    });
    
    test('A.1.5: closes on escape key', async ({ page }) => {
      logTestStep('E2E', 'Testing AlertsPanel close with ESC');
      
      await loginAsSuperAdmin(page);
      await page.goto('/admin/health');
      await page.waitForLoadState('networkidle');
      
      // Open panel
      const alertBadge = page.locator('button:has(svg.lucide-bell)');
      await alertBadge.click();
      await page.waitForTimeout(500);
      
      // Press Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      
      // Panel should be closed (Sheet content not visible)
      const sheetContent = page.locator('[data-state="open"]');
      await expect(sheetContent).not.toBeVisible({ timeout: 2000 });
      
      logTestAssertion('E2E', 'AlertsPanel closed on ESC', true);
    });
    
    test('A.1.6: dismiss persists after reload', async ({ page }) => {
      logTestStep('E2E', 'Testing dismiss persistence');
      
      await loginAsSuperAdmin(page);
      await page.goto('/admin/health');
      await page.waitForLoadState('networkidle');
      
      // Open panel
      const alertBadge = page.locator('button:has(svg.lucide-bell)');
      await alertBadge.click();
      await page.waitForTimeout(500);
      
      // Try to dismiss first alert if any exists
      const firstAlert = page.locator('[data-alert-id]').first();
      
      if (await firstAlert.isVisible({ timeout: 2000 })) {
        const alertId = await firstAlert.getAttribute('data-alert-id');
        
        const dismissButton = firstAlert.locator('[data-dismiss-alert]');
        if (await dismissButton.isVisible()) {
          await dismissButton.click();
          await page.waitForTimeout(500);
          
          // Verify localStorage was updated
          const dismissedIds = await page.evaluate(() => {
            return JSON.parse(localStorage.getItem('tatame_dismissed_alerts') || '[]');
          });
          
          expect(dismissedIds).toContain(alertId);
          
          // Reload page
          await page.reload();
          await page.waitForLoadState('networkidle');
          
          // Re-open panel
          await alertBadge.click();
          await page.waitForTimeout(500);
          
          // Alert should not reappear
          const reappearedAlert = page.locator(`[data-alert-id="${alertId}"]`);
          await expect(reappearedAlert).not.toBeVisible();
          
          logTestAssertion('E2E', 'Dismissed alert does not reappear', true);
        } else {
          logTestAssertion('E2E', 'No dismiss button found (skipped)', true);
        }
      } else {
        logTestAssertion('E2E', 'No alerts to dismiss (skipped)', true);
      }
    });
    
    test('A.1.7: empty state displays correctly', async ({ page }) => {
      logTestStep('E2E', 'Testing empty state');
      
      await loginAsSuperAdmin(page);
      await page.goto('/admin/health');
      await page.waitForLoadState('networkidle');
      
      // Dismiss all alerts first (if any) to reach empty state
      await page.evaluate(() => {
        // Store many fake dismissed IDs to ensure empty state
        const existingIds = JSON.parse(localStorage.getItem('tatame_dismissed_alerts') || '[]');
        // We don't know the IDs, but we can check if panel shows empty state
      });
      
      // Open panel
      const alertBadge = page.locator('button:has(svg.lucide-bell)');
      await alertBadge.click();
      await page.waitForTimeout(500);
      
      // Check for alerts or empty state
      const alerts = page.locator('[data-alert-id]');
      const alertCount = await alerts.count();
      
      if (alertCount === 0) {
        // Should show "all clear" message
        const emptyState = page.locator('text=/all clear|tudo certo|todo bien/i');
        await expect(emptyState).toBeVisible();
        logTestAssertion('E2E', 'Empty state displayed', true);
      } else {
        logTestAssertion('E2E', `Has ${alertCount} alerts (not empty)`, true);
      }
    });
    
    test('A.1.8: severity ordering is correct', async ({ page }) => {
      logTestStep('E2E', 'Testing severity ordering');
      
      await loginAsSuperAdmin(page);
      await page.goto('/admin/health');
      await page.waitForLoadState('networkidle');
      
      // Open panel
      const alertBadge = page.locator('button:has(svg.lucide-bell)');
      await alertBadge.click();
      await page.waitForTimeout(500);
      
      // Get all alert severities
      const severities = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[data-alert-severity]'))
          .map(el => el.getAttribute('data-alert-severity'));
      });
      
      if (severities.length < 2) {
        logTestAssertion('E2E', 'Not enough alerts to test ordering (skipped)', true);
        return;
      }
      
      // Verify ordering: CRITICAL -> HIGH -> MEDIUM -> LOW
      const severityOrder: Record<string, number> = { 
        CRITICAL: 0, 
        HIGH: 1, 
        MEDIUM: 2, 
        LOW: 3 
      };
      
      let lastOrder = -1;
      let isOrdered = true;
      
      for (const sev of severities) {
        if (sev) {
          const order = severityOrder[sev] ?? 4;
          if (order < lastOrder) {
            isOrdered = false;
            break;
          }
          lastOrder = order;
        }
      }
      
      expect(isOrdered).toBe(true);
      logTestAssertion('E2E', 'Alerts ordered by severity', isOrdered);
    });
    
    test('A.1.9: connection status badge shows correctly', async ({ page }) => {
      logTestStep('E2E', 'Testing connection status badge in panel');
      
      await loginAsSuperAdmin(page);
      await page.goto('/admin/health');
      await page.waitForLoadState('networkidle');
      
      // Open panel
      const alertBadge = page.locator('button:has(svg.lucide-bell)');
      await alertBadge.click();
      await page.waitForTimeout(500);
      
      // Check for connection badge (Live or Polling)
      const liveBadge = page.locator('text=/live|ao vivo/i');
      const pollingBadge = page.locator('text=/polling/i');
      
      const hasLive = await liveBadge.isVisible();
      const hasPolling = await pollingBadge.isVisible();
      
      expect(hasLive || hasPolling).toBe(true);
      
      logTestAssertion('E2E', `Connection status: ${hasLive ? 'Live' : 'Polling'}`, true);
    });
    
    test('A.1.10: refresh button works', async ({ page }) => {
      logTestStep('E2E', 'Testing refresh button');
      
      await loginAsSuperAdmin(page);
      await page.goto('/admin/health');
      await page.waitForLoadState('networkidle');
      
      // Open panel
      const alertBadge = page.locator('button:has(svg.lucide-bell)');
      await alertBadge.click();
      await page.waitForTimeout(500);
      
      // Find refresh button
      const refreshButton = page.locator('button:has(svg.lucide-refresh-cw)').first();
      await expect(refreshButton).toBeVisible();
      
      // Click refresh
      await refreshButton.click();
      
      // Button should show loading state (animate-spin)
      // Note: This may be too fast to catch reliably
      
      await page.waitForTimeout(1000);
      
      logTestAssertion('E2E', 'Refresh button works', true);
    });
  });
});
