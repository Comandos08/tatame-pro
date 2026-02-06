/**
 * 🧪 Tenant Modality Contract Tests
 * 
 * Validates that the system enforces explicit modality selection
 * and rejects tenant creation without modalities.
 * 
 * Contract: "O sistema se recusa a criar tenants sem modalidade explicitamente definida.
 * Nenhuma modalidade é inferida, presumida ou aplicada por padrão."
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../fixtures/users.seed';

const SUPERADMIN = TEST_USERS.SUPERADMIN;

test.describe('Tenant Modality Contract', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login
    await page.goto('/login');
    
    // Login as superadmin
    await page.fill('input[type="email"]', SUPERADMIN.email);
    await page.fill('input[type="password"]', SUPERADMIN.password);
    await page.click('button[type="submit"]');
    
    // Wait for redirect to admin dashboard
    await page.waitForURL(/\/admin/, { timeout: 15000 });
  });

  test('rejects tenant creation without modality selection', async ({ page }) => {
    // Click "Nova Organização" button
    await page.click('button:has-text("Nova Organização")');
    
    // Wait for dialog to appear
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    
    // Fill name and slug but DO NOT select any modality
    await page.fill('input[id="tenant-name"]', 'Test No Modality Org');
    await page.fill('input[id="tenant-slug"]', 'test-no-modality');
    
    // Click create button
    await page.click('[role="dialog"] button:has-text("Criar")');
    
    // Expect error toast about modality requirement
    await expect(page.locator('text=Selecione pelo menos uma modalidade')).toBeVisible({ timeout: 5000 });
    
    // Dialog should still be open (creation failed)
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test('allows tenant creation with explicit modality selection', async ({ page }) => {
    const testOrgName = `Test Org ${Date.now()}`;
    
    // Click "Nova Organização" button
    await page.click('button:has-text("Nova Organização")');
    
    // Wait for dialog to appear
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    
    // Fill name and slug
    await page.fill('input[id="tenant-name"]', testOrgName);
    
    // Select a modality explicitly (click on Judo badge)
    await page.click('[role="dialog"] .cursor-pointer:has-text("Judo")');
    
    // Verify modality is selected (has active styling)
    await expect(page.locator('[role="dialog"] .cursor-pointer:has-text("Judo")')).toHaveClass(/border-primary/);
    
    // Click create button
    await page.click('[role="dialog"] button:has-text("Criar")');
    
    // Expect success toast
    await expect(page.locator(`text=criada com sucesso`)).toBeVisible({ timeout: 10000 });
    
    // Dialog should be closed
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('no default modality is pre-selected in CreateTenantDialog', async ({ page }) => {
    // Click "Nova Organização" button
    await page.click('button:has-text("Nova Organização")');
    
    // Wait for dialog to appear
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    
    // Verify no modality badges have the selected styling
    const modalityBadges = page.locator('[role="dialog"] .cursor-pointer').filter({ hasText: /Jiu-Jitsu|Judo|Muay Thai|Wrestling|Boxing/ });
    
    // Count how many have the "selected" class (border-primary)
    const selectedCount = await modalityBadges.filter({ has: page.locator('.border-primary') }).count();
    
    // Should be 0 - no pre-selected modalities
    expect(selectedCount).toBe(0);
  });
});
