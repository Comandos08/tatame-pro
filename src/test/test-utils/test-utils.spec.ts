/**
 * PI U8 — DETERMINISTIC TEST INFRASTRUCTURE VALIDATION
 *
 * Proves that the test helpers themselves are deterministic.
 * This file validates the contracts, not the production code.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  FIXED_TEST_TIME,
  FIXED_TEST_EPOCH,
  FIXED_TEST_IDS,
  ACTIVE_STATE,
  BLOCKED_STATE,
  freezeTestTime,
  unfreezeTestTime,
  mockSystemState,
  mockBlockedState,
  mockFeatureFlags,
  mockTenant,
  buildIdentityContext,
  buildTenantContext,
  buildBillingContext,
} from './index';

describe('PI U8 — Time Control', () => {
  beforeEach(() => freezeTestTime());
  afterEach(() => unfreezeTestTime());

  it('Date.now() returns frozen epoch', () => {
    expect(Date.now()).toBe(FIXED_TEST_EPOCH);
  });

  it('new Date() returns frozen time', () => {
    expect(new Date().toISOString()).toBe(FIXED_TEST_TIME);
  });

  it('custom freeze time works', () => {
    unfreezeTestTime();
    freezeTestTime('2030-06-15T00:00:00.000Z');
    expect(new Date().toISOString()).toBe('2030-06-15T00:00:00.000Z');
  });
});

describe('PI U8 — Constants', () => {
  it('FIXED_TEST_IDS are stable strings', () => {
    expect(FIXED_TEST_IDS.USER_ID).toBe('test-user-00000000-0000-0000-0000-000000000001');
    expect(FIXED_TEST_IDS.TENANT_ID).toBe('test-tenant-00000000-0000-0000-0000-000000000001');
    expect(FIXED_TEST_IDS.TENANT_SLUG).toBe('test-tenant');
  });

  it('ACTIVE_STATE is happy path', () => {
    expect(ACTIVE_STATE.identity).toBe('RESOLVED');
    expect(ACTIVE_STATE.tenant.lifecycle).toBe('ACTIVE');
    expect(ACTIVE_STATE.billing).toBe('ACTIVE');
    expect(ACTIVE_STATE.health).toBe('OK');
  });

  it('BLOCKED_STATE is fail-closed', () => {
    expect(BLOCKED_STATE.identity).toBe('ERROR');
    expect(BLOCKED_STATE.tenant.lifecycle).toBe('BLOCKED');
    expect(BLOCKED_STATE.billing).toBe('BLOCKED');
    expect(BLOCKED_STATE.health).toBe('UNKNOWN');
  });
});

describe('PI U8 — mockSystemState', () => {
  it('defaults to ACTIVE_STATE', () => {
    const state = mockSystemState();
    expect(state.identity).toBe('RESOLVED');
    expect(state.role).toBe('ADMIN_TENANT');
    expect(state.tenant.lifecycle).toBe('ACTIVE');
  });

  it('overrides specific fields', () => {
    const state = mockSystemState({ billing: 'PAST_DUE', health: 'DEGRADED' });
    expect(state.billing).toBe('PAST_DUE');
    expect(state.health).toBe('DEGRADED');
    expect(state.identity).toBe('RESOLVED'); // not overridden
  });

  it('overrides nested tenant fields', () => {
    const state = mockSystemState({ tenant: { id: 'x', slug: 'y', lifecycle: 'SETUP' } });
    expect(state.tenant.lifecycle).toBe('SETUP');
    expect(state.tenant.slug).toBe('y');
  });
});

describe('PI U8 — mockBlockedState', () => {
  it('defaults to BLOCKED_STATE', () => {
    const state = mockBlockedState();
    expect(state.identity).toBe('ERROR');
    expect(state.billing).toBe('BLOCKED');
  });

  it('overrides specific fields', () => {
    const state = mockBlockedState({ health: 'CRITICAL' });
    expect(state.health).toBe('CRITICAL');
    expect(state.billing).toBe('BLOCKED'); // not overridden
  });
});

describe('PI U8 — mockFeatureFlags', () => {
  it('defaults all flags to false (fail-closed)', () => {
    const flags = mockFeatureFlags();
    expect(flags.EVENTS_V2).toBe(false);
    expect(flags.ADVANCED_REPORTS).toBe(false);
    expect(flags.DIGITAL_DIPLOMA_PDF).toBe(false);
    expect(flags.ACADEMY_PUBLIC_PAGE).toBe(false);
    expect(flags.EXPERIMENTAL_UI).toBe(false);
  });

  it('overrides specific flags', () => {
    const flags = mockFeatureFlags({ EVENTS_V2: true });
    expect(flags.EVENTS_V2).toBe(true);
    expect(flags.ADVANCED_REPORTS).toBe(false);
  });
});

describe('PI U8 — mockTenant', () => {
  it('defaults to ACTIVE tenant', () => {
    const tenant = mockTenant();
    expect(tenant.lifecycle).toBe('ACTIVE');
    expect(tenant.slug).toBe('test-tenant');
  });

  it('overrides lifecycle', () => {
    const tenant = mockTenant({ lifecycle: 'SETUP' });
    expect(tenant.lifecycle).toBe('SETUP');
  });
});

describe('PI U8 — Render Helpers', () => {
  it('buildIdentityContext detects admin', () => {
    const ctx = buildIdentityContext({ role: 'SUPERADMIN_GLOBAL' });
    expect(ctx.isAdmin).toBe(true);
    expect(ctx.expectedDataRole).toBe('SUPERADMIN_GLOBAL');
  });

  it('buildIdentityContext detects blocked', () => {
    const ctx = buildIdentityContext({
      tenant: { id: 'x', slug: 'x', lifecycle: 'BLOCKED' },
    });
    expect(ctx.isBlocked).toBe(true);
  });

  it('buildTenantContext detects operational', () => {
    const ctx = buildTenantContext();
    expect(ctx.isOperational).toBe(true);
    expect(ctx.expectedTenantStatus).toBe('ACTIVE');
  });

  it('buildBillingContext detects good standing', () => {
    const ctx = buildBillingContext({ billing: 'TRIAL' });
    expect(ctx.isGoodStanding).toBe(true);
  });

  it('buildBillingContext detects bad standing', () => {
    const ctx = buildBillingContext({ billing: 'PAST_DUE' });
    expect(ctx.isGoodStanding).toBe(false);
  });
});
