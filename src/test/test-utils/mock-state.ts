/**
 * PI U8 — DETERMINISTIC STATE MOCKS
 *
 * Canonical mock builders for system state.
 * Every test must declare state explicitly — nothing inherited.
 *
 * Usage:
 *   const state = mockSystemState({ billing: 'PAST_DUE' });
 *   const flags = mockFeatureFlags({ EVENTS_V2: true });
 */

import type {
  MockSystemState,
  TestFeatureFlagMap,
  TestFeatureFlag,
} from './types';
import { ACTIVE_STATE, BLOCKED_STATE } from './constants';

const ALL_FLAGS: TestFeatureFlag[] = [
  'EVENTS_V2',
  'ADVANCED_REPORTS',
  'DIGITAL_DIPLOMA_PDF',
  'ACADEMY_PUBLIC_PAGE',
  'EXPERIMENTAL_UI',
];

/**
 * Build a complete mock system state with explicit overrides.
 * Defaults to ACTIVE (happy path).
 */
export function mockSystemState(
  overrides: Partial<MockSystemState> = {}
): MockSystemState {
  return {
    ...ACTIVE_STATE,
    ...overrides,
    tenant: {
      ...ACTIVE_STATE.tenant,
      ...(overrides.tenant ?? {}),
    },
    flags: {
      ...ACTIVE_STATE.flags,
      ...(overrides.flags ?? {}),
    },
  };
}

/**
 * Build a blocked/fail-closed mock state.
 */
export function mockBlockedState(
  overrides: Partial<MockSystemState> = {}
): MockSystemState {
  return {
    ...BLOCKED_STATE,
    ...overrides,
    tenant: {
      ...BLOCKED_STATE.tenant,
      ...(overrides.tenant ?? {}),
    },
    flags: {
      ...BLOCKED_STATE.flags,
      ...(overrides.flags ?? {}),
    },
  };
}

/**
 * Build a feature flag map with explicit overrides.
 * Default: all flags FALSE (fail-closed).
 */
export function mockFeatureFlags(
  overrides: Partial<TestFeatureFlagMap> = {}
): TestFeatureFlagMap {
  const map = {} as TestFeatureFlagMap;
  for (const flag of ALL_FLAGS) {
    map[flag] = false;
  }
  return { ...map, ...overrides };
}

/**
 * Build a tenant mock for a specific lifecycle state.
 */
export function mockTenant(
  overrides: Partial<MockSystemState['tenant']> = {}
): MockSystemState['tenant'] {
  return {
    ...ACTIVE_STATE.tenant,
    ...overrides,
  };
}
