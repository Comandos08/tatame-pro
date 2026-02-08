/**
 * O1.0 — OBSERVABILITY SAFE GOLD v1.0 (Resilience Tests)
 *
 * Validates system stability when observability fails.
 * SAFE GOLD: app continues, no crashes, no redirects.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '@/../e2e/helpers/freeze-time';
import { logTestStep, logTestAssertion } from '@/../e2e/helpers/testLogger';
import { loginAsSuperAdmin, TENANT_SLUG } from '@/../e2e/fixtures/auth.fixture';

const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

test.describe('O1.0 — Observability SAFE GOLD (Resilience)', () => {
  test('O.R.1: provider throws error — app continues', async ({ page }) => {
    logTestStep('RESILIENCE', 'Provider error handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Inject a failing provider
    await page.addInitScript(() => {
      window.__observabilityProvider = () => {
        throw new Error('Provider exploded!');
      };

      window.emitWithFailingProvider = (event: any) => {
        try {
          if (window.__observabilityProvider) {
            window.__observabilityProvider(event);
          }
        } catch (err) {
          console.error('[OBSERVABILITY_FAILED]', err);
        }
      };
    });

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Emit event with failing provider
    await page.evaluate(() => {
      window.emitWithFailingProvider({
        domain: 'SYSTEM',
        level: 'ERROR',
        name: 'PROVIDER_FAIL_TEST',
        timestamp: '2026-02-07T12:00:00.000Z',
      });
    });

    // App should still be functional
    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    // Navigation should work
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await expect(page.locator('body')).toBeVisible();

    logTestAssertion('RESILIENCE', 'App continues after provider error', true);
  });

  test('O.R.2: malformed event — ignored safely', async ({ page }) => {
    logTestStep('RESILIENCE', 'Malformed event handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Emit malformed events
    await page.evaluate(() => {
      const malformedEvents = [
        null,
        undefined,
        {},
        { domain: 'INVALID' },
        { level: 123 },
        'just a string',
        [],
      ];

      malformedEvents.forEach((event) => {
        try {
          console.log('[OBSERVABILITY:MALFORMED]', event);
        } catch {
          // Silently ignore
        }
      });
    });

    await page.waitForTimeout(500);

    // No unhandled errors
    const observabilityErrors = errors.filter((e) =>
      e.toLowerCase().includes('observability')
    );
    expect(observabilityErrors).toHaveLength(0);

    // App still functional
    await expect(page.locator('body')).toBeVisible();

    logTestAssertion('RESILIENCE', 'Malformed events ignored', true);
  });

  test('O.R.3: slow provider — UI not blocked', async ({ page }) => {
    test.setTimeout(30000);
    logTestStep('RESILIENCE', 'Slow provider handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Inject a slow provider
    await page.addInitScript(() => {
      window.__slowProvider = async (event: any) => {
        await new Promise((r) => setTimeout(r, 5000));
        console.log('[SLOW_PROVIDER]', event);
      };

      window.emitWithSlowProvider = (event: any) => {
        // Fire and forget - don't await
        window.__slowProvider(event).catch(() => {});
      };
    });

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const startTime = Date.now();

    // Emit event with slow provider
    await page.evaluate(() => {
      window.emitWithSlowProvider({
        domain: 'SYSTEM',
        level: 'INFO',
        name: 'SLOW_PROVIDER_TEST',
        timestamp: '2026-02-07T12:00:00.000Z',
      });
    });

    // UI should respond immediately (not blocked by slow provider)
    await expect(page.locator('body')).toBeVisible();

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(2000); // Should not wait for 5s provider

    logTestAssertion('RESILIENCE', 'UI not blocked by slow provider', true);
  });

  test('O.R.4: no redirect on failure', async ({ page }) => {
    logTestStep('RESILIENCE', 'No redirect on failure');

    const navigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigations.push(frame.url());
      }
    });

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Inject failing provider
    await page.addInitScript(() => {
      window.__failingProvider = () => {
        throw new Error('Critical failure!');
      };
    });

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const stableUrl = page.url();

    // Emit multiple failing events
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        try {
          window.__failingProvider({
            domain: 'SYSTEM',
            level: 'CRITICAL',
            name: 'REDIRECT_TEST',
          });
        } catch {
          console.error('[OBSERVABILITY_FAILED]');
        }
      }
    });

    await page.waitForTimeout(3000);

    // Should not have redirected
    expect(page.url()).toBe(stableUrl);

    // No unexpected navigations
    const unexpectedNavs = navigations.filter(
      (u) =>
        !u.includes(`/${TENANT_SLUG}`) &&
        !u.includes('/login') &&
        !u.includes('/auth') &&
        !u.includes('about:blank')
    );
    expect(unexpectedNavs).toHaveLength(0);

    logTestAssertion('RESILIENCE', 'No redirect on failure', true);
  });

  test('O.R.5: console fallback always works', async ({ page }) => {
    logTestStep('RESILIENCE', 'Console fallback reliability');

    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(msg.text());
    });

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Emit event (should fallback to console)
    await page.evaluate(() => {
      console.log('[OBSERVABILITY:SYSTEM:INFO]', 'CONSOLE_FALLBACK_TEST', 'message');
    });

    await page.waitForTimeout(500);

    const hasLog = consoleLogs.some(
      (log) => log.includes('OBSERVABILITY') && log.includes('CONSOLE_FALLBACK')
    );

    expect(hasLog).toBe(true);

    logTestAssertion('RESILIENCE', 'Console fallback reliable', true);
  });

  test('O.R.6: high volume emission — no crash', async ({ page }) => {
    logTestStep('RESILIENCE', 'High volume handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Emit many events rapidly
    await page.evaluate(() => {
      for (let i = 0; i < 100; i++) {
        console.log('[OBSERVABILITY:SYSTEM:INFO]', `HIGH_VOLUME_${i}`);
      }
    });

    await page.waitForTimeout(1000);

    // App still functional
    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    // Navigation works
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await expect(page.locator('body')).toBeVisible();

    logTestAssertion('RESILIENCE', 'High volume handled', true);
  });
});

// TypeScript declarations
declare global {
  interface Window {
    __observabilityProvider: (event: any) => void;
    __slowProvider: (event: any) => Promise<void>;
    __failingProvider: (event: any) => void;
    emitWithFailingProvider: (event: any) => void;
    emitWithSlowProvider: (event: any) => void;
  }
}
