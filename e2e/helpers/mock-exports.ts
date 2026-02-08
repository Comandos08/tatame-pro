/**
 * PI EXPORTS1.0 — EXPORTS SAFE GOLD — E2E Mock Helpers
 *
 * Deterministic mocks for Export endpoints.
 * No Date.now() or new Date().
 */

import type { Page } from '@playwright/test';

export const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

export const FIXED_IDS = {
  TENANT_ID: 'tenant_exports_01',
  EXPORT_ID_CSV: 'export_csv_01',
  EXPORT_ID_PDF: 'export_pdf_01',
  USER_ID: 'user_exports_01',
};

export type MockExportType = 'CSV' | 'PDF';

/**
 * EXPORTS1.0: Protected tables — NO mutations allowed during export operations
 */
export const EXPORTS_PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'memberships',
  'athletes',
  'events',
  'reports',
  'tenant_billing',
  'tenant_invoices',
] as const;

/**
 * Deterministic CSV content for idempotency testing
 */
export const FIXED_CSV_CONTENT = `id,name,email,created_at
athlete_001,João Silva,joao@example.com,${FIXED_TIMESTAMP_ISO}
athlete_002,Maria Santos,maria@example.com,${FIXED_TIMESTAMP_ISO}
athlete_003,Pedro Costa,pedro@example.com,${FIXED_TIMESTAMP_ISO}`;

/**
 * Deterministic PDF metadata for idempotency testing
 */
export const FIXED_PDF_METADATA = {
  export_id: FIXED_IDS.EXPORT_ID_PDF,
  type: 'PDF',
  generated_at: FIXED_TIMESTAMP_ISO,
  page_count: 3,
  size_bytes: 45678,
  content_hash: 'sha256_fixed_abc123def456',
};

interface MockExportsConfig {
  type?: MockExportType;
  tenantSlug?: string;
  emptyData?: boolean;
  simulateError?: boolean;
}

/**
 * Mock export endpoints with deterministic values.
 */
export async function mockExportsUniversal(
  page: Page,
  config: MockExportsConfig = {}
) {
  const exportType = config.type ?? 'CSV';
  const tenantSlug = config.tenantSlug ?? 'test-tenant';
  const emptyData = config.emptyData ?? false;
  const simulateError = config.simulateError ?? false;

  await page.route('**/*', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // SAFE GOLD: only mock GET requests for exports
    if (method !== 'GET') return route.continue();

    // Mock CSV export endpoint
    if (url.includes('/export/csv') || url.includes('/download/csv')) {
      if (simulateError) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Export failed' }),
        });
      }
      
      return route.fulfill({
        status: 200,
        contentType: 'text/csv',
        headers: {
          'Content-Disposition': `attachment; filename="export_${FIXED_TIMESTAMP_ISO}.csv"`,
        },
        body: emptyData ? 'id,name,email,created_at\n' : FIXED_CSV_CONTENT,
      });
    }

    // Mock PDF export endpoint
    if (url.includes('/export/pdf') || url.includes('/download/pdf')) {
      if (simulateError) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Export failed' }),
        });
      }
      
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          metadata: FIXED_PDF_METADATA,
          download_url: `https://example.com/exports/${FIXED_IDS.EXPORT_ID_PDF}.pdf`,
        }),
      });
    }

    // Mock export status endpoint
    if (url.includes('/export/status') || url.includes('/functions/v1/export')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          export_id: exportType === 'CSV' ? FIXED_IDS.EXPORT_ID_CSV : FIXED_IDS.EXPORT_ID_PDF,
          type: exportType,
          status: 'DONE',
          generated_at: FIXED_TIMESTAMP_ISO,
          rows: emptyData ? 0 : 120,
          tenant_id: FIXED_IDS.TENANT_ID,
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
          name: 'SAFE GOLD Exports Tenant',
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
 * Mock export failures for resilience testing.
 */
export async function mockExportsFailure(
  page: Page,
  type: FailureType
) {
  await page.route('**/*', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // Only intercept GET requests to export-related endpoints
    if (method !== 'GET') return route.continue();
    
    const isExportEndpoint = 
      url.includes('/export') ||
      url.includes('/download') ||
      url.includes('/csv') ||
      url.includes('/pdf') ||
      (url.includes('/functions/v1') && url.toLowerCase().includes('export'));

    if (!isExportEndpoint) return route.continue();

    switch (type) {
      case '403':
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Forbidden', message: 'Export access denied' }),
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
          body: '{ invalid json export [[',
        });

      default:
        return route.continue();
    }
  });
}

/**
 * EXPORTS1.0: Track mutations to protected tables during test execution.
 * Returns a function to get captured mutations.
 */
export async function trackExportsMutations(page: Page): Promise<() => string[]> {
  const mutations: string[] = [];

  await page.route('**/rest/v1/**', (route, request) => {
    const method = request.method();
    const url = request.url();

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      for (const table of EXPORTS_PROTECTED_TABLES) {
        if (url.includes(`/rest/v1/${table}`)) {
          mutations.push(`${method} ${table}`);
        }
      }
    }
    route.continue();
  });

  return () => mutations;
}

/**
 * Generate deterministic export for idempotency testing.
 * Same inputs ALWAYS produce same outputs.
 */
export function generateDeterministicExport(type: MockExportType): {
  content: string;
  hash: string;
  metadata: Record<string, unknown>;
} {
  if (type === 'CSV') {
    return {
      content: FIXED_CSV_CONTENT,
      hash: 'sha256_csv_fixed_hash_abc123',
      metadata: {
        export_id: FIXED_IDS.EXPORT_ID_CSV,
        type: 'CSV',
        generated_at: FIXED_TIMESTAMP_ISO,
        rows: 3,
      },
    };
  }
  
  return {
    content: 'FIXED_PDF_BINARY_PLACEHOLDER',
    hash: FIXED_PDF_METADATA.content_hash,
    metadata: FIXED_PDF_METADATA,
  };
}
