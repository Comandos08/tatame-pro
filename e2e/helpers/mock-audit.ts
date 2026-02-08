/**
 * 🔐 AUDIT2.0 — Deterministic Mocks (SAFE GOLD)
 * 
 * Fixed data for E2E testing.
 * All values are static — no dynamic generation.
 * 
 * FROZEN: Do not modify without constitutional review.
 */

import type { Page, Route } from '@playwright/test';

// ============================================================
// FIXED IDENTIFIERS — DETERMINISTIC
// ============================================================

export const FIXED_AUDIT_IDS = {
  LOG_1: 'audit-log-001-fixed',
  LOG_2: 'audit-log-002-fixed',
  LOG_3: 'audit-log-003-fixed',
  TENANT: 'tenant-audit-test-fixed',
  ACTOR: 'actor-audit-test-fixed',
  ENTITY: 'entity-audit-test-fixed',
} as const;

export const FIXED_AUDIT_TIMESTAMP = '2026-02-07T12:00:00.000Z';

// ============================================================
// MOCK DATA — DETERMINISTIC
// ============================================================

export const MOCK_AUDIT_LOGS = [
  {
    id: FIXED_AUDIT_IDS.LOG_1,
    tenant_id: FIXED_AUDIT_IDS.TENANT,
    profile_id: FIXED_AUDIT_IDS.ACTOR,
    event_type: 'CREATE_MEMBERSHIP',
    category: 'MEMBERSHIP',
    metadata: {
      entity_id: FIXED_AUDIT_IDS.ENTITY,
      level: 'INFO',
      occurred_at: FIXED_AUDIT_TIMESTAMP,
      hash: 'abc123def456',
      safe_gold_version: '2.0',
    },
    created_at: FIXED_AUDIT_TIMESTAMP,
  },
  {
    id: FIXED_AUDIT_IDS.LOG_2,
    tenant_id: FIXED_AUDIT_IDS.TENANT,
    profile_id: FIXED_AUDIT_IDS.ACTOR,
    event_type: 'APPROVE_MEMBERSHIP',
    category: 'MEMBERSHIP',
    metadata: {
      entity_id: FIXED_AUDIT_IDS.ENTITY,
      level: 'INFO',
      occurred_at: FIXED_AUDIT_TIMESTAMP,
      hash: 'def456ghi789',
      safe_gold_version: '2.0',
    },
    created_at: FIXED_AUDIT_TIMESTAMP,
  },
  {
    id: FIXED_AUDIT_IDS.LOG_3,
    tenant_id: FIXED_AUDIT_IDS.TENANT,
    profile_id: FIXED_AUDIT_IDS.ACTOR,
    event_type: 'LOGIN_USER',
    category: 'AUTH',
    metadata: {
      entity_id: null,
      level: 'INFO',
      occurred_at: FIXED_AUDIT_TIMESTAMP,
      hash: 'ghi789jkl012',
      safe_gold_version: '2.0',
    },
    created_at: FIXED_AUDIT_TIMESTAMP,
  },
];

// ============================================================
// ROUTE INTERCEPTORS
// ============================================================

/**
 * Mock successful audit log fetch.
 */
export async function mockAuditLogsSuccess(page: Page): Promise<void> {
  await page.route('**/rest/v1/audit_logs*', async (route: Route) => {
    const method = route.request().method();
    
    // Block mutations during audit reads
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Mutations blocked during audit reads' }),
      });
      return;
    }
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AUDIT_LOGS),
      headers: {
        'content-range': `0-${MOCK_AUDIT_LOGS.length - 1}/${MOCK_AUDIT_LOGS.length}`,
      },
    });
  });
}

/**
 * Mock audit log fetch with empty result.
 */
export async function mockAuditLogsEmpty(page: Page): Promise<void> {
  await page.route('**/rest/v1/audit_logs*', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
        headers: { 'content-range': '0-0/0' },
      });
    }
  });
}

/**
 * Mock audit log fetch with 403 error.
 */
export async function mockAuditLogs403(page: Page): Promise<void> {
  await page.route('**/rest/v1/audit_logs*', async (route: Route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Forbidden' }),
    });
  });
}

/**
 * Mock audit log fetch with 500 error.
 */
export async function mockAuditLogs500(page: Page): Promise<void> {
  await page.route('**/rest/v1/audit_logs*', async (route: Route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal Server Error' }),
    });
  });
}

/**
 * Mock audit log fetch with timeout.
 */
export async function mockAuditLogsTimeout(page: Page): Promise<void> {
  await page.route('**/rest/v1/audit_logs*', async (route: Route) => {
    await new Promise(resolve => setTimeout(resolve, 30000));
    await route.abort('timedout');
  });
}

/**
 * Mock audit log fetch with invalid JSON.
 */
export async function mockAuditLogsInvalidJson(page: Page): Promise<void> {
  await page.route('**/rest/v1/audit_logs*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'not valid json {{{',
    });
  });
}

// ============================================================
// MUTATION DETECTION
// ============================================================

/**
 * Track mutation attempts to protected tables.
 */
export async function trackMutationAttempts(page: Page): Promise<{ count: number; attempts: string[] }> {
  const attempts: string[] = [];
  
  await page.route('**/rest/v1/**', async (route: Route) => {
    const method = route.request().method();
    const url = route.request().url();
    
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      attempts.push(`${method} ${url}`);
    }
    
    await route.continue();
  });
  
  return {
    get count() { return attempts.length; },
    attempts,
  };
}
