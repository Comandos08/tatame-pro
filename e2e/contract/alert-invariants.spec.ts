/**
 * 📋 P4.3.C — Alert Contract Invariant Tests
 * 
 * Validates core alert invariants:
 * - No duplicates
 * - Dismissed stays dismissed
 * - Severity ordering is deterministic
 * 
 * SAFE GOLD: Read-only validation.
 */

import { test, expect } from '@playwright/test';
import { loginAsSuperAdmin } from '../fixtures/auth.fixture';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

test.describe('Alert Contract Invariants', () => {
  test('C.1.1: Same event never appears twice in alerts list', async ({ page }) => {
    logTestStep('CONTRACT', 'Testing alert uniqueness');
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Wait for data to load
    await page.waitForTimeout(2000);
    
    // Open alerts panel
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    await alertBadge.click();
    await page.waitForTimeout(500);
    
    // Get all alert IDs
    const alertIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-alert-id]'))
        .map(el => el.getAttribute('data-alert-id'))
        .filter(Boolean) as string[];
    });
    
    if (alertIds.length === 0) {
      logTestAssertion('CONTRACT', 'No alerts to check (empty is valid)', true);
      return;
    }
    
    // All IDs must be unique
    const uniqueIds = new Set(alertIds);
    const hasDuplicates = alertIds.length !== uniqueIds.size;
    
    expect(hasDuplicates).toBe(false);
    
    if (hasDuplicates) {
      const duplicates = alertIds.filter((id, i) => alertIds.indexOf(id) !== i);
      console.error('Duplicate IDs found:', duplicates);
    }
    
    logTestAssertion('CONTRACT', `All ${alertIds.length} alerts have unique IDs`, !hasDuplicates);
  });
  
  test('C.1.2: Dismissed alert never reappears after reload', async ({ page }) => {
    logTestStep('CONTRACT', 'Testing dismiss persistence');
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Open panel
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    await alertBadge.click();
    await page.waitForTimeout(500);
    
    // Find first alert
    const firstAlert = page.locator('[data-alert-id]').first();
    
    if (!(await firstAlert.isVisible({ timeout: 2000 }))) {
      logTestAssertion('CONTRACT', 'No alerts to dismiss (skipped)', true);
      return;
    }
    
    const alertId = await firstAlert.getAttribute('data-alert-id');
    
    // Dismiss it
    const dismissButton = page.locator(`[data-dismiss-alert="${alertId}"]`);
    if (await dismissButton.isVisible()) {
      await dismissButton.click();
      await page.waitForTimeout(500);
      
      // Verify it's in localStorage
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
      
      // Alert should NOT reappear
      const reappearedAlert = page.locator(`[data-alert-id="${alertId}"]`);
      await expect(reappearedAlert).not.toBeVisible();
      
      logTestAssertion('CONTRACT', `Alert ${alertId} stays dismissed after reload`, true);
    } else {
      logTestAssertion('CONTRACT', 'No dismiss button found (skipped)', true);
    }
  });
  
  test('C.1.3: Dismissed alert never reappears after refresh', async ({ page }) => {
    logTestStep('CONTRACT', 'Testing dismiss persistence after manual refresh');
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Open panel
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    await alertBadge.click();
    await page.waitForTimeout(500);
    
    // Find and dismiss first alert
    const firstAlert = page.locator('[data-alert-id]').first();
    
    if (!(await firstAlert.isVisible({ timeout: 2000 }))) {
      logTestAssertion('CONTRACT', 'No alerts to dismiss (skipped)', true);
      return;
    }
    
    const alertId = await firstAlert.getAttribute('data-alert-id');
    
    const dismissButton = page.locator(`[data-dismiss-alert="${alertId}"]`);
    if (await dismissButton.isVisible()) {
      await dismissButton.click();
      await page.waitForTimeout(500);
      
      // Click refresh button
      const refreshButton = page.locator('button:has(svg.lucide-refresh-cw)').first();
      if (await refreshButton.isVisible()) {
        await refreshButton.click();
        await page.waitForTimeout(2000);
      }
      
      // Alert should NOT reappear
      const reappearedAlert = page.locator(`[data-alert-id="${alertId}"]`);
      await expect(reappearedAlert).not.toBeVisible();
      
      logTestAssertion('CONTRACT', `Alert ${alertId} stays dismissed after refresh`, true);
    } else {
      logTestAssertion('CONTRACT', 'No dismiss button found (skipped)', true);
    }
  });
  
  test('C.1.4: Severity ordering is deterministic', async ({ page }) => {
    logTestStep('CONTRACT', 'Testing severity ordering');
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    await alertBadge.click();
    await page.waitForTimeout(500);
    
    // Get severity order
    const severities = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-alert-severity]'))
        .map(el => el.getAttribute('data-alert-severity'))
        .filter(Boolean) as string[];
    });
    
    if (severities.length < 2) {
      logTestAssertion('CONTRACT', 'Not enough alerts to verify ordering (skipped)', true);
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
      const order = severityOrder[sev] ?? 4;
      if (order < lastOrder) {
        isOrdered = false;
        console.error(`Out of order: ${sev} came after severity with order ${lastOrder}`);
        break;
      }
      lastOrder = order;
    }
    
    expect(isOrdered).toBe(true);
    
    logTestAssertion('CONTRACT', `Severities ordered correctly: ${severities.join(' → ')}`, isOrdered);
  });
  
  test('C.1.5: localStorage dismissed IDs are valid UUIDs', async ({ page }) => {
    logTestStep('CONTRACT', 'Testing dismissed ID format');
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    const dismissedIds = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('tatame_dismissed_alerts') || '[]');
    });
    
    if (dismissedIds.length === 0) {
      logTestAssertion('CONTRACT', 'No dismissed IDs to validate (valid)', true);
      return;
    }
    
    // UUID v4 regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    const allValid = dismissedIds.every((id: string) => uuidRegex.test(id));
    
    expect(allValid).toBe(true);
    
    logTestAssertion('CONTRACT', `All ${dismissedIds.length} dismissed IDs are valid UUIDs`, allValid);
  });
});
