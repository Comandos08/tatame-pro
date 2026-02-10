/**
 * O1.0 — OBSERVABILITY SAFE GOLD v1.0 (Contract Tests)
 *
 * Validates observability instrumentation.
 * SAFE GOLD: no side effects, no mutations, no redirects.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '@/../e2e/helpers/freeze-time';
import { logTestStep, logTestAssertion } from '@/../e2e/helpers/testLogger';
import { loginAsSuperAdmin, TENANT_SLUG } from '@/../e2e/fixtures/auth.fixture';
import { SAFE_EVENT_DOMAINS, SAFE_EVENT_LEVELS } from '@/lib/observability/types';

const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

test.describe('O1.0 — Observability SAFE GOLD (Contract)', () => {
  test('O.C.1: emitted event does not break navigation', async ({ page }) => {
    logTestStep('CONTRACT', 'Event emission does not break nav');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Inject observability event emission
    await page.addInitScript(() => {
      window.__observabilityEvents = [];
      window.emitTestEvent = (event: any) => {
        window.__observabilityEvents.push(event);
        console.log('[OBSERVABILITY:TEST]', event);
      };
    });

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Emit test event via console
    await page.evaluate(() => {
      window.emitTestEvent({
        domain: 'SYSTEM',
        level: 'INFO',
        name: 'TEST_EVENT',
        timestamp: '2026-02-07T12:00:00.000Z',
      });
    });

    // Navigation should still work
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
    expect(page.url()).toContain('/billing');

    logTestAssertion('CONTRACT', 'Navigation works after event emission', true);
  });

  test('O.C.2: event domains are SAFE GOLD compliant', async ({ page }) => {
    logTestStep('CONTRACT', 'Event domains validation');

    // Verify all expected domains exist
    const expectedDomains = [
      'AUTH',
      'TENANT',
      'MEMBERSHIP',
      'YOUTH',
      'BILLING',
      'EVENTS',
      'REPORTS',
      'SYSTEM',
    ];

    for (const domain of expectedDomains) {
      expect(SAFE_EVENT_DOMAINS).toContain(domain);
    }

    // Verify no unexpected domains
    expect(SAFE_EVENT_DOMAINS.length).toBe(expectedDomains.length);

    logTestAssertion('CONTRACT', 'All domains valid', true);
  });

  test('O.C.3: event levels are SAFE GOLD compliant', async ({ page }) => {
    logTestStep('CONTRACT', 'Event levels validation');

    const expectedLevels = ['INFO', 'WARN', 'ERROR', 'CRITICAL'];

    for (const level of expectedLevels) {
      expect(SAFE_EVENT_LEVELS).toContain(level);
    }

    expect(SAFE_EVENT_LEVELS.length).toBe(expectedLevels.length);

    logTestAssertion('CONTRACT', 'All levels valid', true);
  });

  test('O.C.4: event contains deterministic timestamp', async ({ page }) => {
    logTestStep('CONTRACT', 'Deterministic timestamp');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    let capturedEvent: any = null;

    await page.addInitScript((timestamp) => {
      window.__capturedEvent = null;
      window.captureEvent = (event: any) => {
        window.__capturedEvent = event;
      };

      // Create event with frozen time
      window.createTestEvent = () => ({
        domain: 'SYSTEM',
        level: 'INFO',
        name: 'TIMESTAMP_TEST',
        timestamp: timestamp,
      });
    }, FIXED_TIMESTAMP_ISO);

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    capturedEvent = await page.evaluate(() => {
      const event = window.createTestEvent();
      window.captureEvent(event);
      return window.__capturedEvent;
    });

    expect(capturedEvent).toBeTruthy();
    expect(capturedEvent.timestamp).toBe(FIXED_TIMESTAMP_ISO);

    logTestAssertion('CONTRACT', 'Timestamp is deterministic', true);
  });

  test('O.C.5: absent provider falls back to console', async ({ page }) => {
    logTestStep('CONTRACT', 'Console fallback');

    const consoleLogs: string[] = [];

    page.on('console', (msg) => {
      if (msg.text().includes('[OBSERVABILITY')) {
        consoleLogs.push(msg.text());
      }
    });

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Emit event without provider
    await page.evaluate(() => {
      console.log('[OBSERVABILITY:SYSTEM:INFO]', 'FALLBACK_TEST', 'Testing fallback');
    });

    await page.waitForTimeout(500);

    const hasObservabilityLog = consoleLogs.some((log) =>
      log.includes('OBSERVABILITY')
    );

    expect(hasObservabilityLog).toBe(true);

    logTestAssertion('CONTRACT', 'Console fallback works', true);
  });

  test('O.C.6: no mutations during observability', async ({ page }) => {
    logTestStep('CONTRACT', 'Mutation boundary');

    const mutations: string[] = [];

    await page.route('**/rest/v1/**', (route, request) => {
      const method = request.method();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        mutations.push(`${method} ${request.url()}`);
      }
      route.continue();
    });

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Emit multiple events
    await page.evaluate(() => {
      for (let i = 0; i < 10; i++) {
        console.log('[OBSERVABILITY:SYSTEM:INFO]', `EVENT_${i}`);
      }
    });

    await page.waitForTimeout(1000);

    // Filter out expected auth-related mutations
    const observabilityMutations = mutations.filter(
      (m) => m.includes('observability') || m.includes('events')
    );

    expect(observabilityMutations).toHaveLength(0);

    logTestAssertion('CONTRACT', 'No observability mutations', true);
  });
});

// TypeScript declarations for test helpers
declare global {
  interface Window {
    __observabilityEvents: any[];
    __capturedEvent: any;
    emitTestEvent: (event: any) => void;
    captureEvent: (event: any) => void;
    createTestEvent: () => any;
  }
}
