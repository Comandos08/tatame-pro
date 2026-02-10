/**
 * PI U8 — DETERMINISTIC TEST CONSTANTS
 *
 * Fixed values for deterministic testing.
 * No Date.now(). No Math.random(). No UUIDs.
 */

/** Frozen time — all tests use this as "now" */
export const FIXED_TEST_TIME = '2025-01-01T12:00:00.000Z';
export const FIXED_TEST_EPOCH = new Date(FIXED_TEST_TIME).getTime();

/** Fixed IDs for test entities */
export const FIXED_TEST_IDS = {
  USER_ID: 'test-user-00000000-0000-0000-0000-000000000001',
  TENANT_ID: 'test-tenant-00000000-0000-0000-0000-000000000001',
  TENANT_SLUG: 'test-tenant',
  MEMBERSHIP_ID: 'test-membership-00000000-0000-0000-0000-000000000001',
  ATHLETE_ID: 'test-athlete-00000000-0000-0000-0000-000000000001',
} as const;

/** Default blocked state — fail-closed */
export const BLOCKED_STATE = {
  identity: 'ERROR' as const,
  role: 'ATLETA' as const,
  tenant: {
    id: FIXED_TEST_IDS.TENANT_ID,
    slug: FIXED_TEST_IDS.TENANT_SLUG,
    lifecycle: 'BLOCKED' as const,
  },
  membership: 'SUSPENDED' as const,
  billing: 'BLOCKED' as const,
  health: 'UNKNOWN' as const,
  flags: {},
};

/** Default happy-path state */
export const ACTIVE_STATE = {
  identity: 'RESOLVED' as const,
  role: 'ADMIN_TENANT' as const,
  tenant: {
    id: FIXED_TEST_IDS.TENANT_ID,
    slug: FIXED_TEST_IDS.TENANT_SLUG,
    lifecycle: 'ACTIVE' as const,
  },
  membership: 'ACTIVE' as const,
  billing: 'ACTIVE' as const,
  health: 'OK' as const,
  flags: {},
};
