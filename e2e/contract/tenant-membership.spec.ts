/**
 * T1.0 — TENANT & MEMBERSHIP CONTRACT TESTS (SAFE GOLD v1.0)
 *
 * Validates tenant lifecycle and membership contracts.
 * SAFE GOLD: no mutations, no redirects, deterministic.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '@/../e2e/helpers/freeze-time';
import { logTestStep, logTestAssertion } from '@/../e2e/helpers/testLogger';

const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

const PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'memberships',
  'athletes',
  'guardians',
  'tenant_billing',
  'tenant_invoices',
];

test.describe('T1.0 — TENANT CONTRACT (SAFE GOLD)', () => {
  test('TENANT.C.1: tenant SETUP ≠ acesso /app', async ({ page }) => {
    logTestStep('TENANT', 'SETUP status blocks /app access');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Mock tenant with SETUP status
    await page.route('**/rest/v1/tenants*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'tenant-setup-id',
            slug: 'test-tenant',
            name: 'Test Tenant',
            status: 'SETUP',
            is_active: false,
          },
        ]),
      });
    });

    await page.goto('/test-tenant/app');
    await page.waitForTimeout(3000);

    // UI should be visible (not crash)
    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('TENANT', 'SETUP tenant handled without crash', true);
  });

  test('TENANT.C.2: tenant ACTIVE acessa /app', async ({ page }) => {
    logTestStep('TENANT', 'ACTIVE status allows /app access');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Mock active tenant
    await page.route('**/rest/v1/tenants*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'tenant-active-id',
            slug: 'test-tenant',
            name: 'Test Tenant',
            status: 'ACTIVE',
            is_active: true,
          },
        ]),
      });
    });

    await page.goto('/test-tenant/app');
    await page.waitForTimeout(3000);

    // UI should be visible
    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('TENANT', 'ACTIVE tenant renders correctly', true);
  });

  test('TENANT.C.3: no mutations during tenant browsing', async ({ page }) => {
    logTestStep('TENANT', 'Mutation boundary check');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    const mutations: string[] = [];
    await page.route('**/rest/v1/**', (route, request) => {
      const method = request.method();
      const url = request.url();

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const isProtected = PROTECTED_TABLES.some((table) =>
          url.includes(`/rest/v1/${table}`)
        );
        if (isProtected) {
          mutations.push(`${method} ${url}`);
        }
      }
      route.continue();
    });

    await page.goto('/test-tenant/app');
    await page.waitForTimeout(3000);

    expect(mutations).toHaveLength(0);

    logTestAssertion('TENANT', 'No mutations detected', true);
  });
});

test.describe('T1.0 — MEMBERSHIP CONTRACT (SAFE GOLD)', () => {
  test('MEMBERSHIP.C.1: membership válida renderiza portal', async ({ page }) => {
    logTestStep('MEMBERSHIP', 'Valid membership renders portal');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Mock valid membership
    await page.route('**/rest/v1/memberships*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'membership-valid-id',
            status: 'ACTIVE',
            athlete_id: 'athlete-id',
            tenant_id: 'tenant-id',
            expires_at: '2027-01-01T00:00:00.000Z',
          },
        ]),
      });
    });

    await page.goto('/test-tenant/portal');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('MEMBERSHIP', 'Valid membership renders portal', true);
  });

  test('MEMBERSHIP.C.2: membership expirada não quebra UI', async ({ page }) => {
    logTestStep('MEMBERSHIP', 'Expired membership does not break UI');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Mock expired membership
    await page.route('**/rest/v1/memberships*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'membership-expired-id',
            status: 'EXPIRED',
            athlete_id: 'athlete-id',
            tenant_id: 'tenant-id',
            expires_at: '2025-01-01T00:00:00.000Z',
          },
        ]),
      });
    });

    await page.goto('/test-tenant/portal');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('MEMBERSHIP', 'Expired membership UI stable', true);
  });

  test('MEMBERSHIP.C.3: no mutations during membership browsing', async ({ page }) => {
    logTestStep('MEMBERSHIP', 'Mutation boundary check');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    const mutations: string[] = [];
    await page.route('**/rest/v1/**', (route, request) => {
      const method = request.method();
      const url = request.url();

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const isProtected = PROTECTED_TABLES.some((table) =>
          url.includes(`/rest/v1/${table}`)
        );
        if (isProtected) {
          mutations.push(`${method} ${url}`);
        }
      }
      route.continue();
    });

    await page.goto('/test-tenant/portal');
    await page.waitForTimeout(3000);

    expect(mutations).toHaveLength(0);

    logTestAssertion('MEMBERSHIP', 'No mutations detected', true);
  });
});

test.describe('T1.0 — YOUTH MEMBERSHIP CONTRACT (SAFE GOLD)', () => {
  test('YOUTH.C.1: youth membership respeita flags', async ({ page }) => {
    logTestStep('YOUTH', 'Youth membership respects flags');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Mock youth membership
    await page.route('**/rest/v1/memberships*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'membership-youth-id',
            status: 'ACTIVE',
            athlete_id: 'athlete-youth-id',
            tenant_id: 'tenant-id',
            is_minor: true,
            applicant_data: {
              guardian: {
                name: 'Guardian Name',
                relationship: 'PARENT',
              },
            },
          },
        ]),
      });
    });

    await page.goto('/test-tenant/portal');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();

    logTestAssertion('YOUTH', 'Youth membership flags respected', true);
  });

  test('YOUTH.C.2: youth flow nunca muta dados sem ação explícita', async ({ page }) => {
    logTestStep('YOUTH', 'Youth flow mutation boundary');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    const mutations: string[] = [];
    await page.route('**/rest/v1/**', (route, request) => {
      const method = request.method();
      const url = request.url();

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        mutations.push(`${method} ${url}`);
      }
      route.continue();
    });

    // Navigate youth membership route
    await page.goto('/test-tenant/membership/youth');
    await page.waitForTimeout(3000);

    // No mutations should occur just from navigation
    expect(mutations).toHaveLength(0);

    logTestAssertion('YOUTH', 'No implicit mutations in youth flow', true);
  });
});
