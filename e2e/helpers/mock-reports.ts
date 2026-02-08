/**
 * PI R1.0 — REPORTS SAFE GOLD v1.0 — E2E Mock Helpers
 *
 * Deterministic mocks for Reports endpoints.
 * No Date.now() or new Date().
 */

import type { Page } from '@playwright/test';

export const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

export const FIXED_IDS = {
  TENANT_ID: 'tenant_reports_01',
  REPORT_ID_OVERVIEW: 'report_overview_01',
  REPORT_ID_FINANCIAL: 'report_financial_01',
  REPORT_ID_ATTENDANCE: 'report_attendance_01',
  REPORT_ID_ATHLETES: 'report_athletes_01',
  REPORT_ID_EVENTS: 'report_events_01',
  USER_ID: 'user_reports_01',
};

export type MockReportType = 'OVERVIEW' | 'FINANCIAL' | 'ATTENDANCE' | 'ATHLETES' | 'EVENTS';
export type MockReportScope = 'TENANT' | 'GLOBAL';

interface MockReportsConfig {
  type?: MockReportType;
  scope?: MockReportScope;
  tenantSlug?: string;
}

/**
 * Mock reports data with deterministic values.
 */
export async function mockReportsUniversal(
  page: Page,
  config: MockReportsConfig = {}
) {
  const reportType = config.type ?? 'OVERVIEW';
  const scope = config.scope ?? 'TENANT';
  const tenantSlug = config.tenantSlug ?? 'test-tenant';

  await page.route('**/*', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // SAFE GOLD: only mock GET requests
    if (method !== 'GET') return route.continue();

    // Mock reports endpoint (REST pattern)
    if (url.includes('/rest/v1/reports')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: FIXED_IDS.REPORT_ID_OVERVIEW,
            type: 'OVERVIEW',
            scope: scope,
            tenant_id: scope === 'TENANT' ? FIXED_IDS.TENANT_ID : null,
            created_at: FIXED_TIMESTAMP_ISO,
            updated_at: FIXED_TIMESTAMP_ISO,
          },
          {
            id: FIXED_IDS.REPORT_ID_FINANCIAL,
            type: 'FINANCIAL',
            scope: scope,
            tenant_id: scope === 'TENANT' ? FIXED_IDS.TENANT_ID : null,
            created_at: FIXED_TIMESTAMP_ISO,
            updated_at: FIXED_TIMESTAMP_ISO,
          },
          {
            id: FIXED_IDS.REPORT_ID_ATHLETES,
            type: 'ATHLETES',
            scope: scope,
            tenant_id: scope === 'TENANT' ? FIXED_IDS.TENANT_ID : null,
            created_at: FIXED_TIMESTAMP_ISO,
            updated_at: FIXED_TIMESTAMP_ISO,
          },
          {
            id: FIXED_IDS.REPORT_ID_EVENTS,
            type: 'EVENTS',
            scope: scope,
            tenant_id: scope === 'TENANT' ? FIXED_IDS.TENANT_ID : null,
            created_at: FIXED_TIMESTAMP_ISO,
            updated_at: FIXED_TIMESTAMP_ISO,
          },
        ]),
      });
    }

    // Mock Edge Functions for reports
    if (url.includes('/functions/v1') && url.toLowerCase().includes('report')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            type: reportType,
            scope: scope,
            generated_at: FIXED_TIMESTAMP_ISO,
            metrics: {
              total: 100,
              active: 85,
              pending: 15,
            },
          },
        }),
      });
    }

    // Mock tenants for context
    if (url.includes('/rest/v1/tenants')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: FIXED_IDS.TENANT_ID,
          slug: tenantSlug,
          name: 'SAFE GOLD Reports Tenant',
          status: 'ACTIVE',
          is_active: true,
          onboarding_completed: true,
          created_at: FIXED_TIMESTAMP_ISO,
          updated_at: FIXED_TIMESTAMP_ISO,
        }]),
      });
    }

    return route.continue();
  });
}

type FailureType = '403' | '500' | 'timeout' | 'invalid-json';

/**
 * Mock reports failures for resilience testing.
 */
export async function mockReportsFailure(
  page: Page,
  type: FailureType
) {
  await page.route('**/*', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // Only intercept GET requests to reports-related endpoints
    if (method !== 'GET') return route.continue();
    
    const isReportsEndpoint = 
      url.includes('/rest/v1/reports') ||
      (url.includes('/functions/v1') && url.toLowerCase().includes('report'));

    if (!isReportsEndpoint) return route.continue();

    switch (type) {
      case '403':
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Forbidden', message: 'Access denied' }),
        });

      case '500':
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });

      case 'timeout':
        await new Promise((r) => setTimeout(r, 15000));
        return route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Gateway Timeout' }),
        });

      case 'invalid-json':
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{ invalid json syntax here [[',
        });

      default:
        return route.continue();
    }
  });
}
