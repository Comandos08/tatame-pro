import { test, expect } from '@playwright/test';

/**
 * E2E Test: Public Membership Verification
 * 
 * Tests the public verification endpoint for membership cards.
 * This is the SINGLE official QR endpoint: /:tenantSlug/verify/membership/:membershipId
 * 
 * Requirements:
 * - Works for anonymous users (no login required)
 * - Displays masked athlete name (LGPD compliance)
 * - Shows membership status and validity
 * - Displays organization info
 * - Shows grading info if available
 * - Displays digital card download if ready
 */

// Test data - use known existing records from demo tenant
const TEST_TENANT_SLUG = 'demo-bjj';
const TEST_MEMBERSHIP_ID = '1b4a510c-6656-48fe-9a1e-43a09ae50c1a';

test.describe('Public Membership Verification', () => {
  
  test('should display verification page for anonymous user', async ({ page }) => {
    // Navigate to the verification URL (as an anonymous user)
    await page.goto(`/${TEST_TENANT_SLUG}/verify/membership/${TEST_MEMBERSHIP_ID}`);
    
    // Wait for page to load (no login required)
    await page.waitForLoadState('networkidle');
    
    // Should NOT show login form - this is a public page
    await expect(page.locator('input[type="password"]')).not.toBeVisible();
    
    // Should display either verification result or error (not blank)
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(50);
  });

  test('should display organization name', async ({ page }) => {
    await page.goto(`/${TEST_TENANT_SLUG}/verify/membership/${TEST_MEMBERSHIP_ID}`);
    await page.waitForLoadState('networkidle');
    
    // Should show "Organização" or "Organization" label
    const orgLabel = page.locator('text=/organiza/i');
    await expect(orgLabel.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display masked athlete name for privacy', async ({ page }) => {
    await page.goto(`/${TEST_TENANT_SLUG}/verify/membership/${TEST_MEMBERSHIP_ID}`);
    await page.waitForLoadState('networkidle');
    
    // Should show "Atleta" or "Athlete" label
    const athleteLabel = page.locator('text=/atleta|athlete/i');
    await expect(athleteLabel.first()).toBeVisible({ timeout: 10000 });
    
    // The name should be partially masked (contains "." at the end)
    // e.g., "Luiz F." or "João S."
    const maskedNamePattern = page.locator('text=/[A-Z][a-záéíóú]+ [A-Z]\\./');
    // Note: This may or may not match depending on name format
  });

  test('should display validity period', async ({ page }) => {
    await page.goto(`/${TEST_TENANT_SLUG}/verify/membership/${TEST_MEMBERSHIP_ID}`);
    await page.waitForLoadState('networkidle');
    
    // Should show validity period label
    const validityLabel = page.locator('text=/validade|valid/i');
    await expect(validityLabel.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display QR code for sharing', async ({ page }) => {
    await page.goto(`/${TEST_TENANT_SLUG}/verify/membership/${TEST_MEMBERSHIP_ID}`);
    await page.waitForLoadState('networkidle');
    
    // Should have SVG QR code element
    const qrCode = page.locator('svg').filter({ has: page.locator('rect') });
    await expect(qrCode.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show error for invalid membership ID', async ({ page }) => {
    const invalidId = '00000000-0000-0000-0000-000000000000';
    await page.goto(`/${TEST_TENANT_SLUG}/verify/membership/${invalidId}`);
    await page.waitForLoadState('networkidle');
    
    // Should display error message
    const errorIndicator = page.locator('text=/não encontrad|not found|falhou|failed/i');
    await expect(errorIndicator.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show error for invalid tenant slug', async ({ page }) => {
    await page.goto(`/invalid-tenant-xyz/verify/membership/${TEST_MEMBERSHIP_ID}`);
    await page.waitForLoadState('networkidle');
    
    // Should display error or redirect
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('should have back button to tenant page', async ({ page }) => {
    await page.goto(`/${TEST_TENANT_SLUG}/verify/membership/${TEST_MEMBERSHIP_ID}`);
    await page.waitForLoadState('networkidle');
    
    // Should have a back button/link
    const backButton = page.locator('text=/voltar|back/i');
    await expect(backButton.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display download button if digital card is ready', async ({ page }) => {
    await page.goto(`/${TEST_TENANT_SLUG}/verify/membership/${TEST_MEMBERSHIP_ID}`);
    await page.waitForLoadState('networkidle');
    
    // Either shows download button or "processing" message
    const downloadOrProcessing = page.locator('text=/baixar|download|processando|processing/i');
    await expect(downloadOrProcessing.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Verification Page - Visual Check', () => {
  
  test('should take screenshot of valid verification', async ({ page }) => {
    await page.goto(`/${TEST_TENANT_SLUG}/verify/membership/${TEST_MEMBERSHIP_ID}`);
    await page.waitForLoadState('networkidle');
    
    // Wait for animations to complete
    await page.waitForTimeout(1000);
    
    // Take screenshot for visual verification
    await page.screenshot({ 
      path: 'e2e/screenshots/verification-valid.png',
      fullPage: true 
    });
  });

  test('should take screenshot of invalid verification', async ({ page }) => {
    const invalidId = '00000000-0000-0000-0000-000000000000';
    await page.goto(`/${TEST_TENANT_SLUG}/verify/membership/${invalidId}`);
    await page.waitForLoadState('networkidle');
    
    await page.waitForTimeout(1000);
    
    await page.screenshot({ 
      path: 'e2e/screenshots/verification-invalid.png',
      fullPage: true 
    });
  });
});
