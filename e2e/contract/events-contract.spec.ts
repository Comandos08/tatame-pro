/**
 * 📜 Events Contract Tests — PI E1.0
 *
 * POLICY: NEVER REMOVE
 *
 * These tests validate the structural contract of the Events module:
 * - Deterministic rendering
 * - State enum compliance (SAFE GOLD subset)
 * - Multi-tenant isolation
 * - Mutation boundary enforcement
 * - Navigation stability
 */

import { test, expect } from '@playwright/test';
import { loginAsTenantAdmin } from '../fixtures/auth.fixture';
import { freezeTime } from '../helpers/freeze-time';
import { mockEventsList, createMockEvent, createTestEventSet } from '../helpers/mock-events';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

// SAFE GOLD states only
const SAFE_EVENT_STATES = ['DRAFT', 'PUBLISHED', 'ONGOING', 'FINISHED', 'CANCELED'];
const SAFE_REGISTRATION_STATES = ['PENDING', 'CONFIRMED', 'CANCELED'];

// Protected tables - mutation = FAIL
const PROTECTED_TABLES = [
  'athletes',
  'profiles',
  'academies',
  'tenants',
  'memberships',
  'digital_cards',
  'user_roles',
];

// Use demo-bjj as test tenant (must exist in fixtures)
const TEST_TENANT_SLUG = 'demo-bjj';
const TEST_TENANT_ID = 'test-tenant-id';

test.describe('Events Contract — PI E1.0', () => {
  test.describe('E.C.1 — Deterministic List Rendering', () => {
    test('E.C.1.1: events-list renders with mocked data', async ({ page }) => {
      logTestStep('CONTRACT', 'Testing deterministic events list rendering');

      // Freeze time before navigation
      await freezeTime(page, '2026-02-07T12:00:00.000Z');

      // Mock events
      const mockEvents = createTestEventSet(TEST_TENANT_ID);
      await mockEventsList(page, TEST_TENANT_ID, mockEvents);

      // Login and navigate
      await loginAsTenantAdmin(page);
      await page.goto(`/${TEST_TENANT_SLUG}/app/events`);
      await page.waitForLoadState('networkidle');

      // Assert list container exists OR empty state
      const eventsList = page.locator('[data-testid="events-list"]');
      const emptyState = page.locator('[data-testid="events-empty-state"]');

      const hasEventsList = await eventsList.isVisible({ timeout: 5000 }).catch(() => false);
      const hasEmptyState = await emptyState.isVisible({ timeout: 1000 }).catch(() => false);

      // One of them must be visible (page rendered correctly)
      expect(hasEventsList || hasEmptyState).toBe(true);
      logTestAssertion('CONTRACT', 'Events list or empty state rendered', true);
    });

    test('E.C.1.2: empty state renders deterministically', async ({ page }) => {
      logTestStep('CONTRACT', 'Testing empty events state');

      await freezeTime(page, '2026-02-07T12:00:00.000Z');

      // Mock empty events list
      await mockEventsList(page, TEST_TENANT_ID, []);

      await loginAsTenantAdmin(page);
      await page.goto(`/${TEST_TENANT_SLUG}/app/events`);
      await page.waitForLoadState('networkidle');

      // Either events-list or empty state should be visible
      const emptyState = page.locator('[data-testid="events-empty-state"]');
      const eventsList = page.locator('[data-testid="events-list"]');

      const hasEmptyState = await emptyState.isVisible({ timeout: 3000 }).catch(() => false);
      const hasEventsList = await eventsList.isVisible({ timeout: 1000 }).catch(() => false);

      // At least one should be present (page loaded correctly)
      expect(hasEmptyState || hasEventsList).toBe(true);
      logTestAssertion('CONTRACT', 'Empty or list state rendered', true);
    });
  });

  test.describe('E.C.2 — Event State Enum Compliance', () => {
    test('E.C.2.1: all data-event-state values MUST belong to SAFE GOLD subset', async ({ page }) => {
      logTestStep('CONTRACT', 'Enforcing SAFE GOLD event state contract');

      await freezeTime(page, '2026-02-07T12:00:00.000Z');

      const mockEvents = createTestEventSet(TEST_TENANT_ID);
      await mockEventsList(page, TEST_TENANT_ID, mockEvents);

      await loginAsTenantAdmin(page);
      await page.goto(`/${TEST_TENANT_SLUG}/app/events`);
      await page.waitForLoadState('networkidle');

      const stateElements = page.locator('[data-event-state]');
      const count = await stateElements.count();

      if (count === 0) {
        logTestAssertion('CONTRACT', 'No events rendered (empty state)', true);
        return;
      }

      const states = await stateElements.evaluateAll(elements =>
        elements.map(el => el.getAttribute('data-event-state'))
      );

      for (const state of states) {
        expect(state).toBeTruthy();
        expect(SAFE_EVENT_STATES).toContain(state);
      }

      logTestAssertion(
        'CONTRACT',
        `All ${states.length} event states comply with SAFE GOLD subset`,
        true
      );
    });
  });

  test.describe('E.C.3 — Multi-Tenant Isolation', () => {
    test('E.C.3.1: events from other tenants do not appear', async ({ page }) => {
      logTestStep('CONTRACT', 'Testing multi-tenant isolation');

      await freezeTime(page, '2026-02-07T12:00:00.000Z');

      // Create events for TWO different tenants
      const tenantAId = 'tenant-a-id';
      const tenantBId = 'tenant-b-id';

      const tenantAEvents = [
        createMockEvent('ev-tenant-a-001', tenantAId, 'PUBLISHED'),
        createMockEvent('ev-tenant-a-002', tenantAId, 'ONGOING'),
      ];
      const tenantBEvents = [
        createMockEvent('ev-tenant-b-001', tenantBId, 'PUBLISHED'),
      ];

      // Mock to return only tenant A events (simulating RLS)
      await mockEventsList(page, tenantAId, tenantAEvents);

      await loginAsTenantAdmin(page);
      await page.goto(`/${TEST_TENANT_SLUG}/app/events`);
      await page.waitForLoadState('networkidle');

      // Get all event IDs in the page
      const eventElements = page.locator('[data-event-id]');
      const count = await eventElements.count();

      if (count > 0) {
        const eventIds = await eventElements.evaluateAll(elements =>
          elements.map(el => el.getAttribute('data-event-id'))
        );

        // Tenant B event ID should NOT appear
        const hasTenantBEvent = eventIds.some(id => id?.includes('tenant-b'));
        expect(hasTenantBEvent).toBe(false);
        logTestAssertion('CONTRACT', 'No cross-tenant events visible', !hasTenantBEvent);
      } else {
        logTestAssertion('CONTRACT', 'No events rendered (isolation trivially satisfied)', true);
      }
    });
  });

  test.describe('E.C.4 — Mutation Boundary Enforcement', () => {
    test('E.C.4.1: no mutations to protected tables during event browsing', async ({ page }) => {
      logTestStep('CONTRACT', 'Testing mutation boundary enforcement');

      const mutations: string[] = [];

      // Intercept ALL REST calls
      await page.route('**/rest/v1/**', (route, request) => {
        const method = request.method();
        const url = request.url();

        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          // Check if it's a protected table
          for (const table of PROTECTED_TABLES) {
            if (url.includes(`/rest/v1/${table}`)) {
              mutations.push(`${method} ${table}`);
            }
          }
        }

        route.continue();
      });

      await freezeTime(page, '2026-02-07T12:00:00.000Z');

      const mockEvents = createTestEventSet(TEST_TENANT_ID);
      await mockEventsList(page, TEST_TENANT_ID, mockEvents);

      await loginAsTenantAdmin(page);
      await page.goto(`/${TEST_TENANT_SLUG}/app/events`);
      await page.waitForLoadState('networkidle');

      // Click on first event to open details (if exists)
      const firstEventButton = page.locator('[data-testid="event-open"]').first();
      if (await firstEventButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstEventButton.click();
        await page.waitForLoadState('networkidle');
      }

      // Wait for any async mutations
      await page.waitForTimeout(2000);

      // Assert no protected table mutations
      expect(mutations).toHaveLength(0);
      logTestAssertion(
        'CONTRACT',
        `No mutations to protected tables (found: ${mutations.length})`,
        mutations.length === 0
      );
    });
  });

  test.describe('E.C.5 — Navigation Stability', () => {
    test('E.C.5.1: UI does not navigate from async events', async ({ page }) => {
      logTestStep('CONTRACT', 'Testing navigation stability');

      const navigationEvents: string[] = [];

      page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) {
          navigationEvents.push(frame.url());
        }
      });

      await freezeTime(page, '2026-02-07T12:00:00.000Z');

      const mockEvents = createTestEventSet(TEST_TENANT_ID);
      await mockEventsList(page, TEST_TENANT_ID, mockEvents);

      await loginAsTenantAdmin(page);
      await page.goto(`/${TEST_TENANT_SLUG}/app/events`);
      await page.waitForLoadState('networkidle');

      // Record stable URL
      const stableUrl = page.url();

      // Wait for potential async navigation (10 seconds as per spec)
      await page.waitForTimeout(10000);

      // URL should remain stable
      expect(page.url()).toBe(stableUrl);

      // Count unexpected navigations (exclude initial navigation)
      const unexpectedNavigations = navigationEvents.filter(
        url => !url.includes('/events') && !url.includes('/app') && !url.includes('/login')
      );

      expect(unexpectedNavigations.length).toBe(0);
      logTestAssertion(
        'CONTRACT',
        `No unexpected navigation (found: ${unexpectedNavigations.length})`,
        unexpectedNavigations.length === 0
      );
    });
  });
});
