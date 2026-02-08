/**
 * 📜 Athlete Portal Contract Tests — PI A1.0
 *
 * POLICY: NEVER REMOVE
 *
 * These tests validate the SAFE GOLD contract for the Athlete Portal.
 * All assertions use data-* attributes only (no CSS selectors).
 */

import { test, expect } from '@playwright/test';
import { loginAsApprovedAthlete } from '../fixtures/auth.fixture';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

import {
  mockPortalBase,
  createActivePortalData,
  createEmptyPortalData,
} from '../helpers/mock-athlete-portal';

import {
  SAFE_PORTAL_VIEW_STATES,
  SAFE_MEMBERSHIP_STATES,
  SAFE_CARD_STATES,
} from '../../src/types/athlete-portal-state';

const TEST_TENANT_SLUG = 'demo-bjj';
const TEST_TENANT_ID = 'tenant-portal-01';
const TEST_PROFILE_ID = 'profile-portal-01';

const PROTECTED_TABLES = [
  'profiles',
  'athletes',
  'academies',
  'tenants',
  'memberships',
  'digital_cards',
  'user_roles',
];

test.describe('Athlete Portal Contract — PI A1.0', () => {
  test('A.C.1: renders deterministically with mocked data', async ({ page }) => {
    logTestStep('CONTRACT', 'Deterministic portal rendering');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    const mockData = createActivePortalData(TEST_TENANT_ID, TEST_PROFILE_ID);
    await mockPortalBase(page, mockData);

    await loginAsApprovedAthlete(page);
    await page.goto(`/${TEST_TENANT_SLUG}/portal`);
    await page.waitForLoadState('networkidle');

    const root = page.locator('[data-testid="athlete-portal"]');
    await expect(root).toBeVisible();

    logTestAssertion('CONTRACT', 'Portal rendered deterministically', true);
  });

  test('A.C.2: data-portal-view-state MUST be SAFE GOLD', async ({ page }) => {
    logTestStep('CONTRACT', 'Validating portal view state enum');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    const mockData = createActivePortalData(TEST_TENANT_ID, TEST_PROFILE_ID);
    await mockPortalBase(page, mockData);

    await loginAsApprovedAthlete(page);
    await page.goto(`/${TEST_TENANT_SLUG}/portal`);
    await page.waitForLoadState('networkidle');

    const root = page.locator('[data-testid="athlete-portal"]');
    await expect(root).toBeVisible();

    const state = await root.getAttribute('data-portal-view-state');
    expect(state).toBeTruthy();
    expect(SAFE_PORTAL_VIEW_STATES).toContain(state);

    logTestAssertion('CONTRACT', `Portal view state complies: ${state}`, true);
  });

  test('A.C.3: membership state MUST be SAFE GOLD when card exists', async ({ page }) => {
    logTestStep('CONTRACT', 'Validating membership state enum');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    const mockData = createActivePortalData(TEST_TENANT_ID, TEST_PROFILE_ID);
    await mockPortalBase(page, mockData);

    await loginAsApprovedAthlete(page);
    await page.goto(`/${TEST_TENANT_SLUG}/portal`);
    await page.waitForLoadState('networkidle');

    const membershipCard = page.locator('[data-testid="portal-membership-card"]');
    const visible = await membershipCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!visible) {
      logTestAssertion('CONTRACT', 'Membership card not present (allowed if no membership)', true);
      return;
    }

    const mState = await membershipCard.getAttribute('data-membership-state');
    expect(mState).toBeTruthy();
    expect(SAFE_MEMBERSHIP_STATES).toContain(mState);

    logTestAssertion('CONTRACT', `Membership state complies: ${mState}`, true);
  });

  test('A.C.4: digital card state MUST be SAFE GOLD when card exists', async ({ page }) => {
    logTestStep('CONTRACT', 'Validating digital card state enum');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    const mockData = createActivePortalData(TEST_TENANT_ID, TEST_PROFILE_ID);
    await mockPortalBase(page, mockData);

    await loginAsApprovedAthlete(page);
    await page.goto(`/${TEST_TENANT_SLUG}/portal`);
    await page.waitForLoadState('networkidle');

    const cardElement = page.locator('[data-testid="portal-digital-card"]');
    const visible = await cardElement.isVisible({ timeout: 5000 }).catch(() => false);

    if (!visible) {
      logTestAssertion('CONTRACT', 'Digital card not present (allowed if no card)', true);
      return;
    }

    const cState = await cardElement.getAttribute('data-card-state');
    expect(cState).toBeTruthy();
    expect(SAFE_CARD_STATES).toContain(cState);

    logTestAssertion('CONTRACT', `Card state complies: ${cState}`, true);
  });

  test('A.C.5: NO mutations to protected tables during portal browsing', async ({ page }) => {
    logTestStep('CONTRACT', 'Validating mutation boundary');

    const mutations: string[] = [];

    await page.route('**/rest/v1/**', (route, request) => {
      const method = request.method();
      const url = request.url();

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        for (const table of PROTECTED_TABLES) {
          if (url.includes(`/rest/v1/${table}`)) {
            mutations.push(`${method} ${table}`);
          }
        }
      }
      route.continue();
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    const mockData = createActivePortalData(TEST_TENANT_ID, TEST_PROFILE_ID);
    await mockPortalBase(page, mockData);

    await loginAsApprovedAthlete(page);
    await page.goto(`/${TEST_TENANT_SLUG}/portal`);
    await page.waitForLoadState('networkidle');

    // Browse around
    await page.waitForTimeout(2000);

    expect(mutations).toHaveLength(0);

    logTestAssertion('CONTRACT', 'No mutations to protected tables', true);
  });

  test('A.C.6: Navigation stability (no async redirects)', async ({ page }) => {
    logTestStep('CONTRACT', 'Validating navigation stability');

    const navigations: string[] = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        navigations.push(frame.url());
      }
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    const mockData = createActivePortalData(TEST_TENANT_ID, TEST_PROFILE_ID);
    await mockPortalBase(page, mockData);

    await loginAsApprovedAthlete(page);
    await page.goto(`/${TEST_TENANT_SLUG}/portal`);
    await page.waitForLoadState('networkidle');

    const stableUrl = page.url();

    // Wait 10 seconds for any async redirects
    await page.waitForTimeout(10000);

    expect(page.url()).toBe(stableUrl);

    // Check for unexpected navigations (exclude portal, app, login)
    const unexpectedNavigations = navigations.filter(
      url => !url.includes('/portal') && !url.includes('/app') && !url.includes('/login')
    );

    expect(unexpectedNavigations.length).toBe(0);

    logTestAssertion('CONTRACT', 'Navigation stable for 10 seconds', true);
  });
});
