/**
 * PI U8 — DETERMINISTIC TEST TYPES
 *
 * Canonical types for deterministic test state injection.
 * No logic. No imports from production code (to avoid circular deps).
 */

// Re-export canonical types for test usage
export type TestTenantLifecycleState = 'SETUP' | 'ACTIVE' | 'BLOCKED' | 'DELETED';
export type TestMembershipStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';
export type TestSubscriptionStatus = 'INCOMPLETE' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED';
export type TestIdentityState = 'UNAUTHENTICATED' | 'LOADING' | 'WIZARD_REQUIRED' | 'SUPERADMIN' | 'RESOLVED' | 'ERROR';
export type TestHealthStatus = 'OK' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';
export type TestBillingStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'BLOCKED';
export type TestAppRole = 'SUPERADMIN_GLOBAL' | 'ADMIN_TENANT' | 'ATLETA';

export type TestFeatureFlag =
  | 'EVENTS_V2'
  | 'ADVANCED_REPORTS'
  | 'DIGITAL_DIPLOMA_PDF'
  | 'ACADEMY_PUBLIC_PAGE'
  | 'EXPERIMENTAL_UI';

export type TestFeatureFlagMap = Record<TestFeatureFlag, boolean>;

/**
 * Canonical mock state for deterministic tests.
 * Every field is explicit — nothing inherited.
 */
export interface MockSystemState {
  identity: TestIdentityState;
  role: TestAppRole;
  tenant: {
    id: string;
    slug: string;
    lifecycle: TestTenantLifecycleState;
  };
  membership: TestMembershipStatus;
  billing: TestBillingStatus;
  health: TestHealthStatus;
  flags: Partial<TestFeatureFlagMap>;
}
