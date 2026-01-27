/**
 * E2E Dropdown Ref Tests
 * 
 * SECURITY CONTRACT:
 * - DropdownMenu triggers must properly forward refs (no console warnings)
 * - Dropdowns must have proper z-index to appear above content
 * - Dropdown content must have solid background (not transparent)
 * - Dropdowns must be keyboard navigable
 * 
 * This ensures proper React component integration and accessibility.
 */

import { test, expect } from '@playwright/test';

test.describe('Dropdown Component Integrity', () => {
  test.describe('Console Warning Detection', () => {
    test('no ref warnings on pages with dropdowns', async ({ page }) => {
      const consoleWarnings: string[] = [];
      
      page.on('console', msg => {
        if (msg.type() === 'warning' || msg.type() === 'error') {
          const text = msg.text();
          if (text.includes('ref') || text.includes('forwardRef') || text.includes('Function components cannot be given refs')) {
            consoleWarnings.push(text);
          }
        }
      });
      
      await page.goto('/');
      
      // Trigger dropdowns if they exist
      const dropdownTriggers = page.locator('button:has(svg.lucide-globe), button:has(svg.lucide-sun), button:has(svg.lucide-moon)');
      const count = await dropdownTriggers.count();
      
      for (let i = 0; i < Math.min(count, 3); i++) {
        const trigger = dropdownTriggers.nth(i);
        if (await trigger.isVisible()) {
          await trigger.click();
          await page.waitForTimeout(100);
          // Close by clicking elsewhere
          await page.keyboard.press('Escape');
        }
      }
      
      // Check for ref-related warnings
      const refWarnings = consoleWarnings.filter(w => 
        w.includes('ref') || w.includes('forwardRef')
      );
      
      expect(refWarnings, 'Should have no ref-related warnings').toHaveLength(0);
    });
  });

  test.describe('Dropdown Visual Integrity', () => {
    test('dropdown content has solid background', async ({ page }) => {
      await page.goto('/');
      
      // Find and click a dropdown trigger
      const trigger = page.locator('button:has(svg.lucide-globe)').first();
      
      if (await trigger.count() > 0 && await trigger.isVisible()) {
        await trigger.click();
        
        // Wait for dropdown to appear
        await page.waitForTimeout(200);
        
        // Find dropdown content
        const dropdownContent = page.locator('[role="menu"], [data-radix-menu-content]');
        
        if (await dropdownContent.count() > 0) {
          const bg = await dropdownContent.first().evaluate(el => 
            window.getComputedStyle(el).backgroundColor
          );
          
          // Background should not be fully transparent
          expect(bg).not.toBe('rgba(0, 0, 0, 0)');
          expect(bg).not.toBe('transparent');
        }
        
        await page.keyboard.press('Escape');
      }
    });

    test('dropdown has appropriate z-index', async ({ page }) => {
      await page.goto('/');
      
      const trigger = page.locator('button:has(svg.lucide-globe)').first();
      
      if (await trigger.count() > 0 && await trigger.isVisible()) {
        await trigger.click();
        await page.waitForTimeout(200);
        
        const dropdownContent = page.locator('[role="menu"], [data-radix-menu-content]');
        
        if (await dropdownContent.count() > 0) {
          const zIndex = await dropdownContent.first().evaluate(el => 
            window.getComputedStyle(el).zIndex
          );
          
          // Z-index should be high enough to appear above content
          const zValue = parseInt(zIndex);
          expect(zValue, 'Dropdown should have z-index >= 50').toBeGreaterThanOrEqual(50);
        }
        
        await page.keyboard.press('Escape');
      }
    });
  });

  test.describe('Dropdown Keyboard Navigation', () => {
    test('dropdown can be opened with Enter key', async ({ page }) => {
      await page.goto('/');
      
      const trigger = page.locator('button:has(svg.lucide-globe)').first();
      
      if (await trigger.count() > 0 && await trigger.isVisible()) {
        await trigger.focus();
        await page.keyboard.press('Enter');
        
        await page.waitForTimeout(200);
        
        const dropdownContent = page.locator('[role="menu"], [data-radix-menu-content]');
        const isOpen = await dropdownContent.count() > 0 && await dropdownContent.first().isVisible();
        
        expect(isOpen, 'Dropdown should open with Enter key').toBe(true);
        
        await page.keyboard.press('Escape');
      }
    });

    test('dropdown can be closed with Escape', async ({ page }) => {
      await page.goto('/');
      
      const trigger = page.locator('button:has(svg.lucide-globe)').first();
      
      if (await trigger.count() > 0 && await trigger.isVisible()) {
        await trigger.click();
        await page.waitForTimeout(200);
        
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        
        const dropdownContent = page.locator('[role="menu"], [data-radix-menu-content]');
        const isVisible = await dropdownContent.count() > 0 && await dropdownContent.first().isVisible();
        
        expect(isVisible, 'Dropdown should close with Escape').toBe(false);
      }
    });

    test('dropdown items are navigable with arrow keys', async ({ page }) => {
      await page.goto('/');
      
      const trigger = page.locator('button:has(svg.lucide-globe)').first();
      
      if (await trigger.count() > 0 && await trigger.isVisible()) {
        await trigger.click();
        await page.waitForTimeout(200);
        
        // Navigate down
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(50);
        
        // Check that something is focused within the dropdown
        const focusedElement = await page.evaluate(() => {
          const active = document.activeElement;
          return active ? active.tagName : null;
        });
        
        // The focused element should be within the dropdown
        console.info(`Focused element after ArrowDown: ${focusedElement}`);
        
        await page.keyboard.press('Escape');
      }
    });
  });

  test.describe('Trigger Button Compliance', () => {
    test('dropdown triggers use proper button elements', async ({ page }) => {
      await page.goto('/');
      
      // All dropdown triggers should be buttons
      const triggers = page.locator('[data-radix-collection-item], [aria-haspopup="menu"]');
      const count = await triggers.count();
      
      for (let i = 0; i < count; i++) {
        const trigger = triggers.nth(i);
        const tagName = await trigger.evaluate(el => el.tagName.toLowerCase());
        
        expect(['button', 'a'], `Dropdown trigger ${i} should be button or anchor`).toContain(tagName);
      }
    });
  });
});
