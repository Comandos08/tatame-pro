/**
 * PI U8 — DETERMINISTIC TEST UTILITIES
 *
 * Public API for test infrastructure.
 * Import from '@/test/test-utils' in all tests.
 *
 * ⚠️ FROZEN CONTRACT — changes require PI approval.
 */

// Types
export type {
  MockSystemState,
  TestTenantLifecycleState,
  TestMembershipStatus,
  TestSubscriptionStatus,
  TestIdentityState,
  TestHealthStatus,
  TestBillingStatus,
  TestAppRole,
  TestFeatureFlag,
  TestFeatureFlagMap,
} from './types';

// Constants
export {
  FIXED_TEST_TIME,
  FIXED_TEST_EPOCH,
  FIXED_TEST_IDS,
  BLOCKED_STATE,
  ACTIVE_STATE,
} from './constants';

// Time control
export { freezeTestTime, unfreezeTestTime } from './mock-time';

// State mocks
export {
  mockSystemState,
  mockBlockedState,
  mockFeatureFlags,
  mockTenant,
} from './mock-state';

// Render helpers
export {
  buildIdentityContext,
  buildTenantContext,
  buildBillingContext,
} from './render-helpers';
