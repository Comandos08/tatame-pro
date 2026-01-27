/**
 * Console Warnings E2E Tests
 * 
 * SECURITY CONTRACT:
 * - Zero tolerance for React ref warnings
 * - Zero tolerance for "Function components cannot be given refs"
 * - Zero tolerance for hydration mismatches
 * - Zero tolerance for controlled/uncontrolled component warnings
 * 
 * This test blocks regressions on console quality.
 */

import { test, expect } from '@playwright/test';

test.describe('Console Warning Detection', () => {
  test.describe('Ref Warning Detection', () => {
    test('no "Function components cannot be given refs" warnings', async ({ page }) => {
      const refWarnings: string[] = [];
      
      // Capture all console messages
      page.on('console', msg => {
        const text = msg.text();
        if (
          text.includes('cannot be given refs') ||
          text.includes('Function components cannot be given refs') ||
          text.includes('forwardRef') && text.includes('warning')
        ) {
          refWarnings.push(text);
        }
      });
      
      // Visit home page and interact with common elements
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Try to trigger dropdowns if they exist
      const globeButton = page.locator('button:has(svg.lucide-globe)').first();
      if (await globeButton.count() > 0 && await globeButton.isVisible()) {
        await globeButton.click();
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
      }
      
      // Try theme toggle
      const themeButton = page.locator('button:has(svg.lucide-sun), button:has(svg.lucide-moon)').first();
      if (await themeButton.count() > 0 && await themeButton.isVisible()) {
        await themeButton.click();
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
      }
      
      // Assert no ref warnings
      expect(refWarnings, 'Should have no ref-related warnings').toHaveLength(0);
    });

    test('no ref warnings when navigating to tenant pages', async ({ page }) => {
      const refWarnings: string[] = [];
      
      page.on('console', msg => {
        const text = msg.text();
        if (
          text.includes('cannot be given refs') ||
          text.includes('Function components cannot be given refs')
        ) {
          refWarnings.push(text);
        }
      });
      
      // Navigate to a tenant page
      await page.goto('/tatame-pro-demo');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      
      expect(refWarnings, 'Should have no ref warnings on tenant pages').toHaveLength(0);
    });
  });

  test.describe('Hydration Warning Detection', () => {
    test('no hydration mismatch warnings', async ({ page }) => {
      const hydrationWarnings: string[] = [];
      
      page.on('console', msg => {
        const text = msg.text();
        if (
          text.includes('Hydration') ||
          text.includes('hydration') ||
          text.includes('did not match')
        ) {
          hydrationWarnings.push(text);
        }
      });
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      expect(hydrationWarnings, 'Should have no hydration warnings').toHaveLength(0);
    });
  });

  test.describe('Controlled Component Warnings', () => {
    test('no uncontrolled to controlled warnings', async ({ page }) => {
      const controlWarnings: string[] = [];
      
      page.on('console', msg => {
        const text = msg.text();
        if (
          text.includes('uncontrolled') && text.includes('controlled') ||
          text.includes('changing an uncontrolled') ||
          text.includes('changing a controlled')
        ) {
          controlWarnings.push(text);
        }
      });
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Navigate to login page which has forms
      await page.goto('/login');
      await page.waitForLoadState('networkidle');
      
      // Type in form fields to trigger any controlled/uncontrolled issues
      const emailInput = page.locator('input[name="email"], input[type="email"]').first();
      if (await emailInput.count() > 0) {
        await emailInput.fill('test@example.com');
      }
      
      expect(controlWarnings, 'Should have no controlled/uncontrolled warnings').toHaveLength(0);
    });
  });

  test.describe('Dropdown Functionality Validation', () => {
    test('dropdowns open, close, and respond to keyboard', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Find any dropdown trigger
      const trigger = page.locator('button:has(svg.lucide-globe)').first();
      
      if (await trigger.count() > 0 && await trigger.isVisible()) {
        // Test: Opens on click
        await trigger.click();
        await page.waitForTimeout(200);
        
        const menuContent = page.locator('[role="menu"], [data-radix-menu-content]');
        const isOpen = await menuContent.count() > 0 && await menuContent.first().isVisible();
        expect(isOpen, 'Dropdown should open on click').toBe(true);
        
        // Test: Has correct z-index (above content)
        if (isOpen) {
          const zIndex = await menuContent.first().evaluate(el => 
            parseInt(window.getComputedStyle(el).zIndex) || 0
          );
          expect(zIndex, 'Dropdown z-index should be >= 50').toBeGreaterThanOrEqual(50);
        }
        
        // Test: Closes on Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        
        const isClosed = await menuContent.count() === 0 || !(await menuContent.first().isVisible());
        expect(isClosed, 'Dropdown should close on Escape').toBe(true);
        
        // Test: Opens with Enter key
        await trigger.focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        
        const isOpenAgain = await menuContent.count() > 0 && await menuContent.first().isVisible();
        expect(isOpenAgain, 'Dropdown should open with Enter').toBe(true);
        
        await page.keyboard.press('Escape');
      }
    });

    test('dropdown portal renders with solid background', async ({ page }) => {
      await page.goto('/');
      
      const trigger = page.locator('button:has(svg.lucide-globe)').first();
      
      if (await trigger.count() > 0 && await trigger.isVisible()) {
        await trigger.click();
        await page.waitForTimeout(200);
        
        const menuContent = page.locator('[role="menu"], [data-radix-menu-content]');
        
        if (await menuContent.count() > 0) {
          const bg = await menuContent.first().evaluate(el => 
            window.getComputedStyle(el).backgroundColor
          );
          
          // Background should not be transparent
          expect(bg).not.toBe('rgba(0, 0, 0, 0)');
          expect(bg).not.toBe('transparent');
        }
        
        await page.keyboard.press('Escape');
      }
    });
  });

  test.describe('Critical React Error Detection', () => {
    test('no React errors in console', async ({ page }) => {
      const reactErrors: string[] = [];
      
      page.on('console', msg => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (
            text.includes('React') ||
            text.includes('react') ||
            text.includes('Warning:')
          ) {
            reactErrors.push(text);
          }
        }
      });
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Filter out expected/benign errors
      const criticalErrors = reactErrors.filter(err => 
        !err.includes('404') && 
        !err.includes('network') &&
        !err.includes('favicon')
      );
      
      expect(criticalErrors, 'Should have no critical React errors').toHaveLength(0);
    });
  });
});
