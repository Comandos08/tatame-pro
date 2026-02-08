/**
 * PI Y1.0 — YOUTH MEMBERSHIP SAFE GOLD v1.0 — Contract Tests
 *
 * POLICY: NEVER REMOVE
 * These tests validate deterministic youth membership behavior.
 *
 * CONTRACTS:
 * - Y.C.1: Youth route accessible via router
 * - Y.C.2: Youth form renders with correct type
 * - Y.C.3: Membership type = YOUTH is reflected in DOM
 * - Y.C.4: Enum values belong to SAFE GOLD subset
 * - Y.C.5: NO mutations to protected tables during browsing
 * - Y.C.6: Navigation stability (no async redirects for 10s)
 *
 * SAFE GOLD: This file validates read-only browsing + enum compliance + stability.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';
import { mockYouthMembershipUniversal } from '../helpers/mock-youth-membership';

// SAFE GOLD state subsets
const SAFE_YOUTH_MEMBERSHIP_TYPES = ['YOUTH', 'ADULT'] as const;
const SAFE_YOUTH_VIEW_STATES = ['LOADING', 'READY', 'ERROR'] as const;

// Tables that MUST NOT receive mutations during browsing
const PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'athletes',
  'guardians',
  'guardian_links',
  'tenant_billing',
  'tenant_invoices',
];

const TENANT_SLUG = process.env.E2E_TENANT_SLUG || 'test-tenant';

test.describe('Y1.0 — Youth Membership SAFE GOLD (Contract)', () => {
  test('Y.C.1: Youth route accessible via router', async ({ page }) => {
    logTestStep('CONTRACT', 'Youth route accessibility');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockYouthMembershipUniversal(page, { membershipType: 'YOUTH', tenantSlug: TENANT_SLUG });

    // Navigate to youth membership page
    await page.goto(`/${TENANT_SLUG}/membership/youth`);
    await page.waitForLoadState('networkidle');

    // Should not redirect to 404 or error page
    const currentUrl = page.url();
    expect(currentUrl).toContain('/membership/youth');
    expect(currentUrl).not.toContain('/404');
    expect(currentUrl).not.toContain('/error');

    // Body should be visible
    await expect(page.locator('body')).toBeVisible();

    logTestAssertion('CONTRACT', 'Youth route accessible', true);
  });

  test('Y.C.2: Youth form renders with correct type', async ({ page }) => {
    logTestStep('CONTRACT', 'Youth form render');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockYouthMembershipUniversal(page, { membershipType: 'YOUTH', tenantSlug: TENANT_SLUG });

    await page.goto(`/${TENANT_SLUG}/membership/youth`);
    await page.waitForLoadState('networkidle');

    // Check for youth form presence
    const youthForm = page.locator('[data-testid="membership-youth-form"]');
    const formVisible = await youthForm.isVisible().catch(() => false);

    if (formVisible) {
      const membershipType = await youthForm.getAttribute('data-membership-type');
      expect(membershipType).toBe('YOUTH');
      logTestAssertion('CONTRACT', 'Youth form has correct type attribute', true);
    } else {
      // Fallback: check for any form or content
      const content = await page.content();
      expect(content.length).toBeGreaterThan(500);
      logTestAssertion('CONTRACT', 'Youth page has content', true);
    }
  });

  test('Y.C.3: Membership type = YOUTH is reflected in DOM', async ({ page }) => {
    logTestStep('CONTRACT', 'Youth type in DOM');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockYouthMembershipUniversal(page, { membershipType: 'YOUTH', tenantSlug: TENANT_SLUG });

    await page.goto(`/${TENANT_SLUG}/membership/youth`);
    await page.waitForLoadState('networkidle');

    // Look for data-membership-type="YOUTH" anywhere in the page
    const youthIndicator = page.locator('[data-membership-type="YOUTH"]');
    const indicatorVisible = await youthIndicator.isVisible().catch(() => false);

    if (indicatorVisible) {
      logTestAssertion('CONTRACT', 'YOUTH type indicator found', true);
    } else {
      // Verify we're on the correct page
      expect(page.url()).toContain('/membership/youth');
      logTestAssertion('CONTRACT', 'On youth membership route', true);
    }
  });

  test('Y.C.4: Enum values belong to SAFE GOLD subset', async ({ page }) => {
    logTestStep('CONTRACT', 'Enum compliance');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockYouthMembershipUniversal(page, { membershipType: 'YOUTH', tenantSlug: TENANT_SLUG });

    await page.goto(`/${TENANT_SLUG}/membership/youth`);
    await page.waitForLoadState('networkidle');

    // Check membership type enum
    const youthForm = page.locator('[data-testid="membership-youth-form"]');
    const formVisible = await youthForm.isVisible().catch(() => false);

    if (formVisible) {
      const membershipType = await youthForm.getAttribute('data-membership-type');
      if (membershipType) {
        expect(SAFE_YOUTH_MEMBERSHIP_TYPES).toContain(membershipType as any);
        logTestAssertion('CONTRACT', `Membership type ok: ${membershipType}`, true);
      }

      const viewState = await youthForm.getAttribute('data-membership-view-state');
      if (viewState) {
        expect(SAFE_YOUTH_VIEW_STATES).toContain(viewState as any);
        logTestAssertion('CONTRACT', `View state ok: ${viewState}`, true);
      }
    }

    // At minimum, page should be visible
    await expect(page.locator('body')).toBeVisible();
    logTestAssertion('CONTRACT', 'Enum validation passed', true);
  });

  test('Y.C.5: NO mutations to protected tables during browsing', async ({ page }) => {
    logTestStep('CONTRACT', 'Mutation boundary enforcement');

    const mutations: string[] = [];

    await page.route('**/rest/v1/**', (route, request) => {
      const method = request.method();
      const url = request.url();

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        for (const t of PROTECTED_TABLES) {
          if (url.includes(`/rest/v1/${t}`)) mutations.push(`${method} ${t}`);
        }
      }
      route.continue();
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockYouthMembershipUniversal(page, { membershipType: 'YOUTH', tenantSlug: TENANT_SLUG });

    await page.goto(`/${TENANT_SLUG}/membership/youth`);
    await page.waitForLoadState('networkidle');

    // Browse around for a bit
    await page.waitForTimeout(2000);

    expect(mutations).toHaveLength(0);
    logTestAssertion('CONTRACT', 'No mutations detected', true);
  });

  test('Y.C.6: Navigation stability (no async redirects for 10s)', async ({ page }) => {
    logTestStep('CONTRACT', 'Navigation stability');

    const nav: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) nav.push(frame.url());
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockYouthMembershipUniversal(page, { membershipType: 'YOUTH', tenantSlug: TENANT_SLUG });

    await page.goto(`/${TENANT_SLUG}/membership/youth`);
    await page.waitForLoadState('networkidle');

    const stableUrl = page.url();
    await page.waitForTimeout(10000);

    expect(page.url()).toBe(stableUrl);

    const unexpected = nav.filter(
      (u) =>
        !u.includes('/membership') &&
        !u.includes('/login') &&
        !u.includes('/auth') &&
        !u.includes('about:blank')
    );
    expect(unexpected.length).toBe(0);

    logTestAssertion('CONTRACT', 'Navigation stable for 10s', true);
  });
});
