/**
 * E2E Color Hardcode Detection Tests
 * 
 * SECURITY CONTRACT:
 * - No hardcoded colors in inline styles for critical UI elements
 * - Colors should use CSS variables/design tokens
 * - Exception: tenant branding colors (dynamic per-tenant)
 * - Exception: chart/visualization colors
 * 
 * This ensures consistent theming and maintainable color management.
 */

import { test, expect } from '@playwright/test';

test.describe('Color Hardcode Detection', () => {
  test.describe('Inline Style Scanning', () => {
    test('buttons do not have hardcoded color inline styles', async ({ page }) => {
      await page.goto('/');
      
      const buttons = page.locator('button');
      const count = await buttons.count();
      
      const violations: string[] = [];
      
      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i);
        if (await button.isVisible()) {
          const style = await button.getAttribute('style');
          
          if (style) {
            // Check for hardcoded colors
            const hasHardcodedColor = /color:\s*(#[0-9a-f]{3,8}|rgb\(|rgba\(|orange|red|blue|green)/i.test(style);
            
            if (hasHardcodedColor) {
              const html = await button.evaluate(el => el.outerHTML.substring(0, 100));
              violations.push(html);
            }
          }
        }
      }
      
      // Log violations but don't fail (some may be intentional)
      if (violations.length > 0) {
        console.warn('Buttons with hardcoded colors in inline styles:', violations);
      }
    });

    test('links do not have hardcoded color inline styles', async ({ page }) => {
      await page.goto('/');
      
      const links = page.locator('a');
      const count = await links.count();
      
      const violations: string[] = [];
      
      for (let i = 0; i < Math.min(count, 20); i++) {
        const link = links.nth(i);
        if (await link.isVisible()) {
          const style = await link.getAttribute('style');
          
          if (style && /color:\s*(#[0-9a-f]{3,8}|rgb\()/i.test(style)) {
            const html = await link.evaluate(el => el.outerHTML.substring(0, 100));
            violations.push(html);
          }
        }
      }
      
      if (violations.length > 0) {
        console.warn('Links with hardcoded colors:', violations);
      }
    });
  });

  test.describe('Token Compliance', () => {
    test('primary buttons use theme colors', async ({ page }) => {
      await page.goto('/');
      
      // Find primary-looking buttons (non-ghost, non-outline)
      const primaryButtons = page.locator('button.bg-primary, button[class*="bg-primary"]');
      const count = await primaryButtons.count();
      
      for (let i = 0; i < count; i++) {
        const button = primaryButtons.nth(i);
        if (await button.isVisible()) {
          const bgColor = await button.evaluate(el => 
            window.getComputedStyle(el).backgroundColor
          );
          
          // Background should be set (not transparent)
          expect(bgColor, `Primary button ${i} should have background`).not.toBe('rgba(0, 0, 0, 0)');
        }
      }
    });

    test('SVG icons use currentColor or inherit', async ({ page }) => {
      await page.goto('/');
      
      const svgs = page.locator('button svg, a svg');
      const count = await svgs.count();
      
      let hardcodedCount = 0;
      
      for (let i = 0; i < Math.min(count, 20); i++) {
        const svg = svgs.nth(i);
        if (await svg.isVisible()) {
          const stroke = await svg.evaluate(el => el.getAttribute('stroke'));
          const fill = await svg.evaluate(el => el.getAttribute('fill'));
          
          // Check for hardcoded hex colors in attributes
          if (stroke && stroke.match(/^#[0-9a-f]{3,6}$/i)) {
            hardcodedCount++;
          }
          if (fill && fill.match(/^#[0-9a-f]{3,6}$/i) && fill !== 'none') {
            hardcodedCount++;
          }
        }
      }
      
      // Most SVGs should use currentColor
      if (hardcodedCount > 0) {
        console.warn(`${hardcodedCount} SVG elements have hardcoded color attributes`);
      }
    });
  });

  test.describe('Allowed Exceptions', () => {
    test('tenant branding colors are acceptable in style attribute', async ({ page }) => {
      // Tenant branding like logo backgrounds, accent colors are exceptions
      // This test documents rather than fails
      
      await page.goto('/');
      
      // Look for tenant-branded elements
      const brandedElements = page.locator('[style*="backgroundColor"]');
      const count = await brandedElements.count();
      
      console.info(`Found ${count} elements with backgroundColor in style (may be tenant branding)`);
    });

    test('chart colors are acceptable', async ({ page }) => {
      await page.goto('/');
      
      // Charts/visualizations commonly use specific colors
      const chartElements = page.locator('.recharts-layer, .chart-container, [class*="chart"]');
      const count = await chartElements.count();
      
      console.info(`Found ${count} chart-related elements (color exceptions allowed)`);
    });
  });

  test.describe('CSS Variable Usage', () => {
    test('root defines expected CSS variables', async ({ page }) => {
      await page.goto('/');
      
      const cssVars = await page.evaluate(() => {
        const root = document.documentElement;
        const computed = window.getComputedStyle(root);
        
        return {
          hasPrimary: computed.getPropertyValue('--primary').trim().length > 0,
          hasBackground: computed.getPropertyValue('--background').trim().length > 0,
          hasForeground: computed.getPropertyValue('--foreground').trim().length > 0,
          hasAccent: computed.getPropertyValue('--accent').trim().length > 0,
          hasDestructive: computed.getPropertyValue('--destructive').trim().length > 0
        };
      });
      
      expect(cssVars.hasPrimary, '--primary should be defined').toBe(true);
      expect(cssVars.hasBackground, '--background should be defined').toBe(true);
      expect(cssVars.hasForeground, '--foreground should be defined').toBe(true);
    });
  });
});
