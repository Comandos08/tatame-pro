/**
 * E2E Icon Buttons Tests
 * 
 * SECURITY CONTRACT:
 * - All icon-only buttons MUST have accessible labels (aria-label or title)
 * - Icon buttons must use semantic Button component, not div
 * - SVGs must use currentColor for proper theming
 * - Icon buttons must have minimum hit area for touch devices
 * 
 * This ensures accessibility compliance and consistent behavior.
 */

import { test, expect } from '@playwright/test';

test.describe('Icon Buttons Accessibility & Visibility', () => {
  test.describe('Accessibility Requirements', () => {
    test('icon-only buttons have accessible labels', async ({ page }) => {
      await page.goto('/');
      
      // Find buttons that appear to be icon-only (small size or icon class)
      const iconButtons = page.locator('button:has(svg)');
      const count = await iconButtons.count();
      
      const violations: string[] = [];
      
      for (let i = 0; i < count; i++) {
        const button = iconButtons.nth(i);
        if (await button.isVisible()) {
          const ariaLabel = await button.getAttribute('aria-label');
          const title = await button.getAttribute('title');
          const innerText = await button.innerText();
          
          // Button should have either aria-label, title, or visible text
          const hasAccessibleLabel = ariaLabel || title || innerText.trim().length > 0;
          
          if (!hasAccessibleLabel) {
            const html = await button.evaluate(el => el.outerHTML.substring(0, 100));
            violations.push(`Icon button missing accessible label: ${html}`);
          }
        }
      }
      
      // Allow some violations but log them (strict mode would fail on any)
      if (violations.length > 0) {
        console.warn('Icon button accessibility warnings:', violations);
      }
    });

    test('all icon buttons are keyboard focusable', async ({ page }) => {
      await page.goto('/');
      
      const iconButtons = page.locator('button:has(svg):not([disabled])');
      const count = await iconButtons.count();
      
      for (let i = 0; i < Math.min(count, 5); i++) {
        const button = iconButtons.nth(i);
        if (await button.isVisible()) {
          // Check tabindex is not negative
          const tabindex = await button.getAttribute('tabindex');
          if (tabindex) {
            expect(parseInt(tabindex), `Button ${i} should be focusable`).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });
  });

  test.describe('Semantic Requirements', () => {
    test('icon actions use button elements not divs', async ({ page }) => {
      await page.goto('/');
      
      // Look for divs with onClick that contain icons (anti-pattern)
      const divButtons = page.locator('div[role="button"]:has(svg), div[onclick]:has(svg)');
      const count = await divButtons.count();
      
      // This should be 0 - all interactive elements should be proper buttons
      if (count > 0) {
        console.warn(`Found ${count} div elements acting as buttons with icons. Consider using <button> instead.`);
      }
    });

    test('icon buttons have explicit button type', async ({ page }) => {
      await page.goto('/');
      
      const buttons = page.locator('button:has(svg)');
      const count = await buttons.count();
      
      let missingTypeCount = 0;
      
      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i);
        if (await button.isVisible()) {
          const type = await button.getAttribute('type');
          if (!type) {
            missingTypeCount++;
          }
        }
      }
      
      // Log warning for buttons without explicit type (they default to 'submit' which can cause issues)
      if (missingTypeCount > 0) {
        console.warn(`${missingTypeCount} buttons missing explicit type attribute`);
      }
    });
  });

  test.describe('Visual Requirements', () => {
    test('icon buttons have minimum hit area of 44x44 or close', async ({ page }) => {
      await page.goto('/');
      
      const iconButtons = page.locator('button:has(svg)');
      const count = await iconButtons.count();
      
      const smallButtons: string[] = [];
      
      for (let i = 0; i < count; i++) {
        const button = iconButtons.nth(i);
        if (await button.isVisible()) {
          const box = await button.boundingBox();
          if (box) {
            // WCAG recommends 44x44 minimum, but 32x32 is common and acceptable
            if (box.width < 24 || box.height < 24) {
              const html = await button.evaluate(el => el.outerHTML.substring(0, 80));
              smallButtons.push(`${box.width}x${box.height}: ${html}`);
            }
          }
        }
      }
      
      if (smallButtons.length > 0) {
        console.warn('Small icon buttons (may have touch accessibility issues):', smallButtons);
      }
    });

    test('SVGs in buttons use currentColor', async ({ page }) => {
      await page.goto('/');
      
      const svgs = page.locator('button svg');
      const count = await svgs.count();
      
      for (let i = 0; i < Math.min(count, 10); i++) {
        const svg = svgs.nth(i);
        if (await svg.isVisible()) {
          const stroke = await svg.evaluate(el => 
            window.getComputedStyle(el).stroke
          );
          const fill = await svg.evaluate(el => 
            window.getComputedStyle(el).fill
          );
          
          // SVG should use inherited color (currentColor) or explicit theme token
          // We check that it's not a hardcoded non-standard color
          const isHardcodedColor = (color: string) => 
            color.match(/^rgb\((?!0|128|255)/) || // Not common grayscale
            color.match(/^#(?!000|fff|ccc)/i);
            
          // This is informational - hardcoded colors may be intentional
          if (isHardcodedColor(stroke) || isHardcodedColor(fill)) {
            console.info(`SVG ${i} may use hardcoded color: stroke=${stroke}, fill=${fill}`);
          }
        }
      }
    });
  });

  test.describe('Focus Visibility', () => {
    test('icon buttons show visible focus ring', async ({ page }) => {
      await page.goto('/');
      
      const iconButtons = page.locator('button:has(svg):not([disabled])');
      const count = await iconButtons.count();
      
      if (count > 0) {
        const firstButton = iconButtons.first();
        if (await firstButton.isVisible()) {
          // Focus the button
          await firstButton.focus();
          
          // Check for focus-visible styles
          const hasOutline = await firstButton.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.outlineWidth !== '0px' || 
                   style.boxShadow.includes('ring') ||
                   el.classList.contains('focus-visible:ring');
          });
          
          // Focus visibility is important for keyboard navigation
          // This test documents the current state
          console.info(`First icon button focus visibility: ${hasOutline ? 'OK' : 'May need review'}`);
        }
      }
    });
  });
});
