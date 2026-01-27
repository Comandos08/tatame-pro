/**
 * E2E UI Actions Visibility Tests
 * 
 * SECURITY CONTRACT:
 * - All interactive actions MUST be visible without hover
 * - No action should have opacity: 0 or visibility: hidden by default
 * - All buttons must have pointer-events: auto
 * - No critical action should depend solely on CSS hover state
 * 
 * This ensures users with touch devices, screen readers, and
 * keyboard navigation can always access all functionality.
 */

import { test, expect } from '@playwright/test';

test.describe('UI Actions Visibility Contract', () => {
  test.describe('Navigation Actions', () => {
    test('header buttons are visible without hover on landing page', async ({ page }) => {
      await page.goto('/');
      
      // Theme toggle should be visible
      const themeButton = page.locator('button[title*="Theme"], button:has(svg.lucide-sun), button:has(svg.lucide-moon)').first();
      if (await themeButton.count() > 0) {
        await expect(themeButton).toBeVisible();
        const box = await themeButton.boundingBox();
        expect(box?.width).toBeGreaterThan(0);
        expect(box?.height).toBeGreaterThan(0);
      }
      
      // Language selector should be visible
      const langButton = page.locator('button:has(svg.lucide-globe)').first();
      if (await langButton.count() > 0) {
        await expect(langButton).toBeVisible();
        const box = await langButton.boundingBox();
        expect(box?.width).toBeGreaterThan(0);
        expect(box?.height).toBeGreaterThan(0);
      }
    });

    test('login buttons are visible on auth pages', async ({ page }) => {
      await page.goto('/login');
      
      // Submit button must be visible
      const submitButton = page.locator('button[type="submit"]');
      await expect(submitButton).toBeVisible();
      
      // Check opacity is not 0
      const opacity = await submitButton.evaluate(el => 
        window.getComputedStyle(el).opacity
      );
      expect(parseFloat(opacity)).toBeGreaterThan(0);
    });
  });

  test.describe('Visibility Contract Validation', () => {
    test('no buttons have opacity-0 as default state', async ({ page }) => {
      await page.goto('/');
      
      const buttons = page.locator('button:not([disabled])');
      const count = await buttons.count();
      
      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i);
        if (await button.isVisible()) {
          const opacity = await button.evaluate(el => 
            window.getComputedStyle(el).opacity
          );
          // Opacity should be at least 0.5 for interactive elements
          expect(parseFloat(opacity), `Button ${i} should not be nearly invisible`).toBeGreaterThanOrEqual(0.5);
        }
      }
    });

    test('all visible buttons have pointer-events auto', async ({ page }) => {
      await page.goto('/');
      
      const buttons = page.locator('button:not([disabled])');
      const count = await buttons.count();
      
      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i);
        if (await button.isVisible()) {
          const pointerEvents = await button.evaluate(el => 
            window.getComputedStyle(el).pointerEvents
          );
          expect(pointerEvents, `Button ${i} should have pointer-events: auto`).not.toBe('none');
        }
      }
    });

    test('icon buttons are visible without requiring hover', async ({ page }) => {
      await page.goto('/');
      
      // Find all icon-only buttons (buttons with only svg inside)
      const iconButtons = page.locator('button:has(svg):not(:has-text("a"))');
      const count = await iconButtons.count();
      
      for (let i = 0; i < Math.min(count, 10); i++) {
        const button = iconButtons.nth(i);
        if (await button.isVisible()) {
          const box = await button.boundingBox();
          expect(box, `Icon button ${i} should have bounding box`).not.toBeNull();
          expect(box?.width, `Icon button ${i} should have positive width`).toBeGreaterThan(0);
          expect(box?.height, `Icon button ${i} should have positive height`).toBeGreaterThan(0);
        }
      }
    });
  });

  test.describe('Hover Enhancement vs Requirement', () => {
    test('buttons exist before hover - bounding box check', async ({ page }) => {
      await page.goto('/');
      
      // Screenshot before any hover
      const beforeHover = await page.screenshot({ fullPage: false });
      
      // Find all interactive buttons
      const buttons = page.locator('button');
      const count = await buttons.count();
      
      const boxesBefore: (Record<string, number> | null)[] = [];
      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i);
        const box = await button.boundingBox();
        boxesBefore.push(box);
      }
      
      // All visible buttons should have non-zero bounding boxes
      boxesBefore.forEach((box, i) => {
        if (box) {
          expect(box.width, `Button ${i} should have width > 0`).toBeGreaterThan(0);
          expect(box.height, `Button ${i} should have height > 0`).toBeGreaterThan(0);
        }
      });
    });
  });

  test.describe('Critical Action Visibility', () => {
    test('forgot password link is visible on login page', async ({ page }) => {
      await page.goto('/login');
      
      const forgotLink = page.locator('a[href*="forgot"], button:has-text("forgot")').first();
      if (await forgotLink.count() > 0) {
        await expect(forgotLink).toBeVisible();
      }
    });

    test('join/signup actions are visible', async ({ page }) => {
      await page.goto('/login');
      
      // Look for any signup/register links
      const signupActions = page.locator('a[href*="join"], a[href*="signup"], button:has-text("Sign up"), button:has-text("Join")');
      const count = await signupActions.count();
      
      for (let i = 0; i < count; i++) {
        const action = signupActions.nth(i);
        if (await action.isVisible()) {
          const opacity = await action.evaluate(el => 
            window.getComputedStyle(el).opacity
          );
          expect(parseFloat(opacity)).toBeGreaterThan(0);
        }
      }
    });
  });
});
