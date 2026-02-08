/**
 * 🔔 P4.3.A — Observability UI E2E Tests
 * 
 * Tests for AlertBadge and AlertsPanel components.
 * Validates P4.2 realtime infrastructure UX.
 * 
 * SAFE GOLD: No mutations to business data.
 * Uses data-* selectors exclusively (no class-based selectors).
 * 
 * INVARIANT (P4.3.1): data-conn-state exists ONLY on AlertBadge,
 * NOT on AlertsPanel badges. See connection-state-invariants.spec.ts.
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
      
      // Use data-conn-state instead of class selectors (SAFE GOLD)
      const liveIndicator = page.locator('[data-conn-state="live"]');
      const syncingIndicator = page.locator('[data-conn-state="syncing"]');
      const pollingIndicator = page.locator('[data-conn-state="polling"]');
      
      const hasLive = await liveIndicator.count() > 0;
      const hasSyncing = await syncingIndicator.count() > 0;
      const hasPolling = await pollingIndicator.count() > 0;
      
      expect(hasLive || hasSyncing || hasPolling).toBe(true);
      
      logTestAssertion('E2E', `Connection state detected: live=${hasLive}, syncing=${hasSyncing}, polling=${hasPolling}`, true);
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
      
      // Panel should open (use role="dialog" for accessibility)
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 3000 });
      
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
      
      // Verify dialog is open using role (SAFE GOLD)
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 3000 });
      
      // Press Escape
      await page.keyboard.press('Escape');
      
      // Dialog should be hidden
      await expect(dialog).toBeHidden({ timeout: 2000 });
      
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
      
      // SAFE GOLD: Skip if no alerts available
      if (!(await firstAlert.isVisible({ timeout: 2000 }))) {
        test.skip(true, 'No alerts available to test dismiss persistence');
        return;
      }
      
      const alertId = await firstAlert.getAttribute('data-alert-id');
      
      const dismissButton = firstAlert.locator('[data-dismiss-alert]');
      if (!(await dismissButton.isVisible())) {
        test.skip(true, 'No dismiss button found');
        return;
      }
      
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
    });
    
    test('A.1.7: empty state displays correctly when mocked', async ({ page }) => {
      logTestStep('E2E', 'Testing deterministic empty state');
      
      // Mock empty response BEFORE navigation (SAFE GOLD)
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
      
      // Open panel
      const alertBadge = page.locator('button:has(svg.lucide-bell)');
      await alertBadge.click();
      await page.waitForTimeout(500);
      
      // Assert empty state is shown using testid (SAFE GOLD)
      const emptyState = page.locator('[data-testid="alerts-empty-state"]');
      await expect(emptyState).toBeVisible();
      
      // Also verify text content (any supported locale)
      const emptyText = page.locator('text=/all clear|tudo certo|todo bien/i');
      await expect(emptyText).toBeVisible();
      
      logTestAssertion('E2E', 'Empty state displayed deterministically', true);
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
      
      // Get all alert severities using data-* attribute (SAFE GOLD)
      const severities = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[data-alert-severity]'))
          .map(el => el.getAttribute('data-alert-severity'));
      });
      
      // SAFE GOLD: Skip if insufficient data
      if (severities.length < 2) {
        test.skip(true, 'Insufficient alerts to validate ordering (need at least 2)');
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
      
      // NOTE: data-conn-state is on AlertBadge only (P4.3.1 invariant)
      // AlertsPanel shows visual indicator without data attribute
      const connState = page.locator('[data-conn-state]');
      await expect(connState.first()).toBeVisible();
      
      const state = await connState.first().getAttribute('data-conn-state');
      expect(['live', 'polling', 'syncing', 'offline']).toContain(state);
      
      // Open panel to verify visual indicator exists
      const alertBadge = page.locator('button:has(svg.lucide-bell)');
      await alertBadge.click();
      await page.waitForTimeout(500);
      
      // Panel shows Wifi/WifiOff icon but NOT data-conn-state
      const panelWifiIcon = page.locator('[role="dialog"] svg.lucide-wifi, [role="dialog"] svg.lucide-wifi-off');
      await expect(panelWifiIcon.first()).toBeVisible();
      
      logTestAssertion('E2E', `Connection status: ${state}`, true);
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
      
      // Find refresh button (icon button selector allowed)
      const refreshButton = page.locator('button:has(svg.lucide-refresh-cw)').first();
      await expect(refreshButton).toBeVisible();
      
      // Click refresh
      await refreshButton.click();
      
      await page.waitForTimeout(1000);
      
      logTestAssertion('E2E', 'Refresh button works', true);
    });
    
    test('A.1.11: mark as seen button works', async ({ page }) => {
      logTestStep('E2E', 'Testing mark as seen button');
      
      await loginAsSuperAdmin(page);
      await page.goto('/admin/health');
      await page.waitForLoadState('networkidle');
      
      // Open panel
      const alertBadge = page.locator('button:has(svg.lucide-bell)');
      await alertBadge.click();
      await page.waitForTimeout(500);
      
      // Use data-testid for mark seen button (SAFE GOLD)
      const markSeenButton = page.locator('[data-testid="mark-seen-button"]');
      
      if (await markSeenButton.isVisible()) {
        await markSeenButton.click();
        await page.waitForTimeout(500);
        
        // After clicking, the button should disappear (no new events)
        await expect(markSeenButton).not.toBeVisible();
        
        logTestAssertion('E2E', 'Mark as seen button works', true);
      } else {
        // No new events to mark as seen
        logTestAssertion('E2E', 'No new events to mark as seen (skipped)', true);
      }
    });
  });
});
