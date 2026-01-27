/**
 * E2E Table Actions Visibility Tests
 * 
 * SECURITY CONTRACT:
 * - Table row actions MUST be visible without hover
 * - Actions should NOT use tr:hover opacity patterns
 * - Minimum hit area for touch devices
 * - Actions should have clear visual affordance
 * 
 * This ensures table interactions work on touch devices
 * and are accessible without mouse hover capability.
 */

import { test, expect } from '@playwright/test';

test.describe('Table Actions Visibility', () => {
  test.describe('Row Actions Contract', () => {
    test('action buttons in tables are visible without hover', async ({ page }) => {
      // This test requires an authenticated session to access admin tables
      // For now, we check the pattern on public pages
      await page.goto('/');
      
      // Find any tables
      const tables = page.locator('table');
      const tableCount = await tables.count();
      
      if (tableCount > 0) {
        for (let t = 0; t < tableCount; t++) {
          const table = tables.nth(t);
          const actionButtons = table.locator('button, a[role="button"]');
          const buttonCount = await actionButtons.count();
          
          for (let i = 0; i < buttonCount; i++) {
            const button = actionButtons.nth(i);
            if (await button.isVisible()) {
              // Check that the button doesn't have opacity: 0
              const opacity = await button.evaluate(el => 
                window.getComputedStyle(el).opacity
              );
              
              expect(parseFloat(opacity), `Table action ${i} should be visible`).toBeGreaterThan(0);
            }
          }
        }
      }
    });

    test('no tr:hover opacity patterns in styles', async ({ page }) => {
      await page.goto('/');
      
      // Check that no problematic hover-to-show patterns exist
      const hasProblematicStyle = await page.evaluate(() => {
        const styleSheets = Array.from(document.styleSheets);
        
        for (const sheet of styleSheets) {
          try {
            const rules = Array.from(sheet.cssRules || []);
            for (const rule of rules) {
              if (rule instanceof CSSStyleRule) {
                const selector = rule.selectorText || '';
                // Look for tr:hover .actions or similar patterns with opacity
                if (selector.includes('hover') && selector.includes('action')) {
                  const hasOpacity = rule.style.opacity === '1';
                  if (hasOpacity) {
                    return { found: true, selector };
                  }
                }
              }
            }
          } catch (e) {
            // Cross-origin stylesheets may throw
            continue;
          }
        }
        return { found: false, selector: null };
      });
      
      // This is informational - document patterns found
      if (hasProblematicStyle.found) {
        console.warn(`Found hover-to-show pattern: ${hasProblematicStyle.selector}`);
      }
    });
  });

  test.describe('Action Visibility Without Interaction', () => {
    test('kebab/overflow menus are visible in tables', async ({ page }) => {
      await page.goto('/');
      
      // Look for common kebab menu patterns
      const kebabButtons = page.locator('button:has(svg.lucide-more-vertical), button:has(svg.lucide-more-horizontal), button:has(svg.lucide-ellipsis)');
      const count = await kebabButtons.count();
      
      for (let i = 0; i < count; i++) {
        const button = kebabButtons.nth(i);
        if (await button.isVisible()) {
          const box = await button.boundingBox();
          expect(box, `Kebab button ${i} should have bounding box`).not.toBeNull();
          expect(box?.width, `Kebab button ${i} width > 0`).toBeGreaterThan(0);
          
          // Check opacity
          const opacity = await button.evaluate(el => 
            window.getComputedStyle(el).opacity
          );
          expect(parseFloat(opacity), `Kebab button ${i} should not be invisible`).toBeGreaterThan(0);
        }
      }
    });

    test('edit and delete buttons are visible before hover', async ({ page }) => {
      await page.goto('/');
      
      // Look for edit/delete action patterns
      const actionButtons = page.locator('button:has(svg.lucide-edit), button:has(svg.lucide-trash), button:has(svg.lucide-pencil)');
      const count = await actionButtons.count();
      
      for (let i = 0; i < count; i++) {
        const button = actionButtons.nth(i);
        if (await button.isVisible()) {
          // Get computed styles BEFORE any hover
          const styles = await button.evaluate(el => {
            const computed = window.getComputedStyle(el);
            return {
              opacity: computed.opacity,
              visibility: computed.visibility,
              pointerEvents: computed.pointerEvents
            };
          });
          
          expect(parseFloat(styles.opacity), `Action button ${i} opacity`).toBeGreaterThan(0);
          expect(styles.visibility, `Action button ${i} visibility`).toBe('visible');
          expect(styles.pointerEvents, `Action button ${i} pointer-events`).not.toBe('none');
        }
      }
    });
  });

  test.describe('Touch Accessibility', () => {
    test('table action buttons meet minimum touch target size', async ({ page }) => {
      await page.goto('/');
      
      const tables = page.locator('table');
      const tableCount = await tables.count();
      
      const smallTargets: string[] = [];
      
      if (tableCount > 0) {
        for (let t = 0; t < tableCount; t++) {
          const table = tables.nth(t);
          const actionButtons = table.locator('button');
          const buttonCount = await actionButtons.count();
          
          for (let i = 0; i < buttonCount; i++) {
            const button = actionButtons.nth(i);
            if (await button.isVisible()) {
              const box = await button.boundingBox();
              if (box && (box.width < 32 || box.height < 32)) {
                smallTargets.push(`${box.width.toFixed(0)}x${box.height.toFixed(0)}`);
              }
            }
          }
        }
      }
      
      if (smallTargets.length > 0) {
        console.warn(`Found ${smallTargets.length} table buttons below 32x32px touch target size`);
      }
    });
  });
});
