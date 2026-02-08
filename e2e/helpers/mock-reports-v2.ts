/**
 * PI REPORTS1.0 — REPORTS SAFE GOLD — E2E Mock Helpers v2.0
 *
 * Deterministic mocks for Reports endpoints.
 * No Date.now() or new Date().
 */

import type { Page } from '@playwright/test';

// ============================================
// FIXED VALUES (DETERMINISTIC)
// ============================================

export const FIXED_TIMESTAMP_ISO = '2026-02-08T12:00:00.000Z';

export const FIXED_IDS = {
  TENANT_ID: 'tenant_reports_01',
  REPORT_ID_OVERVIEW: 'report_overview_01',
  REPORT_ID_MEMBERSHIPS: 'report_memberships_01',
  REPORT_ID_EVENTS: 'report_events_01',
  REPORT_ID_BILLING: 'report_billing_01',
  REPORT_ID_AUDIT: 'report_audit_01',
  USER_ID: 'user_reports_01',
};

export const FIXED_REPORT_PAYLOAD = {
  generated_at: FIXED_TIMESTAMP_ISO,
  tenant_id: FIXED_IDS.TENANT_ID,
  reports: {
    TENANT_OVERVIEW: { tenants: 1, academies: 3, coaches: 5 },
    MEMBERSHIPS_HEALTH: { active: 120, expired: 30, pending: 15 },
    EVENTS_SUMMARY: { total: 12, active: 3, completed: 9 },
    BILLING_STATUS: { mrr: 375000, total: 4500000, currency: 'BRL' },
    AUDIT_TRAIL: { last_7_days: 56, last_30_days: 234 },
  },
};

// ============================================
// PROTECTED TABLES (NO MUTATIONS)
// ============================================

export const REPORTS_PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'athletes',
  'memberships',
  'events',
  'event_brackets',
  'tenant_billing',
  'tenant_invoices',
  'audit_logs',
  'diplomas',
  'coaches',
  'academies',
] as const;

// ============================================
// MOCK CONFIGURATION
// ============================================

export interface MockReportsConfig {
  tenantSlug: string;
  emptyData?: boolean;
  partialData?: boolean;
  simulateError?: boolean;
}

// ============================================
// UNIVERSAL MOCK (SUCCESS/EMPTY/PARTIAL/ERROR)
// ============================================

export async function mockReportsUniversal(
  page: Page,
  opts: MockReportsConfig
) {
  const { tenantSlug, emptyData, partialData, simulateError } = opts;

  await page.route('**/*', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // SAFE GOLD: only mock GET requests
    if (method !== 'GET') return route.continue();

    // Reports endpoints (REST pattern)
    if (
      url.includes('/reports') ||
      url.includes('/insights') ||
      url.includes('/summary')
    ) {
      if (simulateError) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Reports failed' }),
        });
      }

      if (emptyData) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            generated_at: FIXED_TIMESTAMP_ISO,
            tenant_id: FIXED_IDS.TENANT_ID,
            reports: {},
          }),
        });
      }

      if (partialData) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            generated_at: FIXED_TIMESTAMP_ISO,
            tenant_id: FIXED_IDS.TENANT_ID,
            partial: true,
            reports: {
              MEMBERSHIPS_HEALTH: FIXED_REPORT_PAYLOAD.reports.MEMBERSHIPS_HEALTH,
              EVENTS_SUMMARY: FIXED_REPORT_PAYLOAD.reports.EVENTS_SUMMARY,
            },
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FIXED_REPORT_PAYLOAD),
      });
    }

    // Mock audit_logs endpoint (used by read.ts)
    if (url.includes('/rest/v1/audit_logs')) {
      if (simulateError) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Audit logs failed' }),
        });
      }

      if (emptyData) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'audit_01',
            tenant_id: FIXED_IDS.TENANT_ID,
            event_type: 'MEMBERSHIP_CREATED',
            category: 'MEMBERSHIP',
            created_at: FIXED_TIMESTAMP_ISO,
            metadata: {},
          },
          {
            id: 'audit_02',
            tenant_id: FIXED_IDS.TENANT_ID,
            event_type: 'EVENT_PUBLISHED',
            category: 'EVENT',
            created_at: FIXED_TIMESTAMP_ISO,
            metadata: {},
          },
        ]),
      });
    }

    // Mock tenants for context
    if (url.includes('/rest/v1/tenants')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: FIXED_IDS.TENANT_ID,
            slug: tenantSlug,
            name: 'SAFE GOLD Reports Tenant',
            status: 'ACTIVE',
            is_active: true,
            onboarding_completed: true,
            created_at: FIXED_TIMESTAMP_ISO,
            updated_at: FIXED_TIMESTAMP_ISO,
          },
        ]),
      });
    }

    return route.continue();
  });
}

// ============================================
// FAILURE MOCKS (RESILIENCE TESTING)
// ============================================

export type FailureType = '403' | '500' | 'timeout' | 'invalid-json';

export async function mockReportsFailure(page: Page, type: FailureType) {
  await page.route('**/*', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // Only intercept GET requests to reports-related endpoints
    if (method !== 'GET') return route.continue();

    const isReportsEndpoint =
      url.includes('/reports') ||
      url.includes('/insights') ||
      url.includes('/summary') ||
      url.includes('/rest/v1/audit_logs') ||
      (url.includes('/functions/v1') && url.toLowerCase().includes('report'));

    if (!isReportsEndpoint) return route.continue();

    switch (type) {
      case '403':
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Forbidden', message: 'Reports access denied' }),
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
          body: '{ invalid json reports [[',
        });

      default:
        return route.continue();
    }
  });
}

// ============================================
// MUTATION TRACKING
// ============================================

export async function trackReportsMutations(page: Page): Promise<() => string[]> {
  const mutations: string[] = [];

  await page.route('**/rest/v1/**', (route, request) => {
    const method = request.method();
    const url = request.url();

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      for (const table of REPORTS_PROTECTED_TABLES) {
        if (url.includes(`/rest/v1/${table}`)) {
          mutations.push(`${method} ${table}`);
        }
      }
    }
    route.continue();
  });

  return () => mutations;
}

// ============================================
// DETERMINISTIC GENERATORS
// ============================================

export function generateDeterministicReports() {
  return { ...FIXED_REPORT_PAYLOAD };
}

export function generateDeterministicReportById(
  reportType: string
): Record<string, unknown> {
  const payload = FIXED_REPORT_PAYLOAD.reports as Record<string, unknown>;
  return (payload[reportType] as Record<string, unknown>) ?? {};
}
