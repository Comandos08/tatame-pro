/**
 * PI U8 — DETERMINISTIC RENDER HELPERS
 *
 * Canonical render functions for testing components
 * with explicit, deterministic state injection.
 *
 * These helpers wrap @testing-library/react render
 * with system state context providers.
 *
 * NOTE: These are scaffolded for future provider integration.
 * Currently they provide state objects for assertion patterns
 * that validate data-* attributes and semantic contracts.
 */

import type { MockSystemState } from './types';
import { mockSystemState } from './mock-state';

/**
 * Build a render context with explicit identity state.
 * Use for testing components that depend on identity resolution.
 */
export function buildIdentityContext(
  overrides: Partial<MockSystemState> = {}
) {
  const state = mockSystemState(overrides);

  return {
    state,
    /** Expected data-state attribute value */
    expectedDataState: state.identity,
    /** Expected data-role attribute value */
    expectedDataRole: state.role,
    /** Whether the user should see admin content */
    isAdmin: state.role === 'SUPERADMIN_GLOBAL' || state.role === 'ADMIN_TENANT',
    /** Whether the user should see blocked UI */
    isBlocked: state.tenant.lifecycle === 'BLOCKED' || state.billing === 'BLOCKED',
  };
}

/**
 * Build a render context with explicit tenant state.
 * Use for testing components that depend on tenant lifecycle.
 */
export function buildTenantContext(
  overrides: Partial<MockSystemState> = {}
) {
  const state = mockSystemState(overrides);

  return {
    state,
    /** Expected data-tenant-status attribute */
    expectedTenantStatus: state.tenant.lifecycle,
    /** Whether tenant is operational */
    isOperational: state.tenant.lifecycle === 'ACTIVE',
  };
}

/**
 * Build a render context with explicit billing state.
 */
export function buildBillingContext(
  overrides: Partial<MockSystemState> = {}
) {
  const state = mockSystemState(overrides);

  return {
    state,
    /** Expected data-billing-status attribute */
    expectedBillingStatus: state.billing,
    /** Whether billing is in good standing */
    isGoodStanding: state.billing === 'ACTIVE' || state.billing === 'TRIAL',
  };
}
