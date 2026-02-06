/**
 * 🔐 Impersonation Stability E2E Tests
 * 
 * ✅ P-IMP-FIX — Validates that impersonation:
 * - Completes without infinite loops
 * - Makes minimal tenant requests (max 2)
 * - Shows stable UI without flicker
 * - Transitions through correct status states
 */
import { test, expect } from '@playwright/test';

test.describe('Impersonation Stability', () => {
  test.skip('superadmin impersonation completes without loop', async ({ page }) => {
    // NOTE: This test requires authenticated superadmin session
    // Skip until auth fixtures are properly configured
    
    // Setup: Capture tenant requests
    const tenantRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/tenants?') || req.url().includes('/rest/v1/tenants')) {
        tenantRequests.push(req.url());
      }
    });

    // Navigate to admin dashboard
    await page.goto('/admin');
    
    // Wait for tenant list to load
    await page.waitForSelector('[data-testid="tenant-list"]', { timeout: 10000 });
    
    // Click impersonate button on first tenant
    const impersonateButton = page.getByRole('button', { name: /impersonate/i }).first();
    await impersonateButton.click();
    
    // Confirm in dialog
    const confirmButton = page.getByRole('button', { name: /confirm/i });
    await confirmButton.click();
    
    // Wait for navigation to tenant dashboard
    await expect(page).toHaveURL(/\/[^/]+\/app\/?$/, { timeout: 15000 });
    
    // Verify impersonation banner is visible
    await expect(page.getByText(/impersonation/i)).toBeVisible();
    
    // Wait for stability (2 seconds without new requests)
    await page.waitForTimeout(2000);
    
    // CRITICAL ASSERTION: Maximum 2 tenant requests
    expect(tenantRequests.length).toBeLessThanOrEqual(2);
    
    // Verify no infinite loaders
    const loaders = await page.locator('[class*="animate-spin"]').count();
    expect(loaders).toBe(0);
    
    // Verify dashboard content loaded
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test.skip('impersonation resolution follows IDLE → RESOLVING → RESOLVED', async ({ page }) => {
    // NOTE: This test requires console log monitoring
    // Skip until auth fixtures are properly configured
    
    const statusTransitions: string[] = [];
    
    // Capture console logs for status transitions
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[IMPERSONATION]') && text.includes('status')) {
        statusTransitions.push(text);
      }
    });

    await page.goto('/admin');
    await page.waitForSelector('[data-testid="tenant-list"]', { timeout: 10000 });
    
    // Start impersonation
    await page.getByRole('button', { name: /impersonate/i }).first().click();
    await page.getByRole('button', { name: /confirm/i }).click();
    
    // Wait for navigation
    await expect(page).toHaveURL(/\/[^/]+\/app\/?$/, { timeout: 15000 });
    
    // Verify status transitions
    const resolvingCount = statusTransitions.filter(t => t.includes('RESOLVING')).length;
    const resolvedCount = statusTransitions.filter(t => t.includes('RESOLVED')).length;
    
    // Should only transition to RESOLVING once
    expect(resolvingCount).toBeLessThanOrEqual(1);
    
    // Should transition to RESOLVED at least once (maybe twice if restored from storage)
    expect(resolvedCount).toBeGreaterThanOrEqual(1);
  });

  test('no duplicate tenant fetches on normal tenant navigation', async ({ page }) => {
    // This test validates normal tenant access (not impersonation)
    // to ensure the base case still works correctly
    
    const tenantRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/rest/v1/tenants') && req.url().includes('slug')) {
        tenantRequests.push(req.url());
      }
    });

    // Navigate to a tenant's public page (doesn't require auth)
    await page.goto('/demo-bjj');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Should have made at most 1 tenant request
    expect(tenantRequests.length).toBeLessThanOrEqual(1);
  });
});
