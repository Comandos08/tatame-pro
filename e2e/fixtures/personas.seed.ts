/**
 * 🧪 Security Test Personas Configuration
 * 
 * Defines test users for comprehensive security testing scenarios.
 * Each persona represents a specific role/permission combination.
 * 
 * IMPORTANT: These users must be seeded in the test database.
 */

export interface SecurityPersona {
  email: string;
  password: string;
  role: string;
  description: string;
  tenantId?: string;
  tenantSlug?: string;
  expectedCapabilities: string[];
  expectedRestrictions: string[];
}

/**
 * Test tenant IDs - must exist in test database
 */
export const TEST_TENANTS = {
  TENANT_A: {
    id: process.env.E2E_TENANT_A_ID || '',
    slug: process.env.E2E_TEST_TENANT_SLUG || 'demo-bjj',
    name: 'Tenant A (Active)',
  },
  TENANT_B: {
    id: process.env.E2E_TENANT_B_ID || '',
    slug: process.env.E2E_TENANT_B_SLUG || 'tenant-b',
    name: 'Tenant B (Isolation Test)',
  },
  TENANT_INCOMPLETE: {
    id: process.env.E2E_TENANT_INCOMPLETE_ID || '',
    slug: process.env.E2E_TENANT_INCOMPLETE_SLUG || 'tenant-incomplete',
    name: 'Tenant Incomplete (Onboarding Test)',
  },
};

/**
 * Security test personas
 */
export const SECURITY_PERSONAS: Record<string, SecurityPersona> = {
  /**
   * 🔴 SUPERADMIN — Global admin, must use impersonation for tenant ops
   */
  SUPERADMIN: {
    email: process.env.E2E_SUPERADMIN_EMAIL || 'superadmin@test.local',
    password: process.env.E2E_SUPERADMIN_PASSWORD || 'Test123!',
    role: 'SUPERADMIN_GLOBAL',
    description: 'Global superadmin - requires impersonation for tenant operations',
    expectedCapabilities: ['access_admin', 'impersonate'],
    expectedRestrictions: ['tenant_ops_without_impersonation'],
  },

  /**
   * 🟢 ADMIN_TENANT_A — Full admin of Tenant A
   */
  ADMIN_TENANT_A: {
    email: process.env.E2E_TENANT_ADMIN_EMAIL || 'admin@test.local',
    password: process.env.E2E_TENANT_ADMIN_PASSWORD || 'Test123!',
    role: 'ADMIN_TENANT',
    description: 'Tenant A admin - full access within own tenant',
    tenantId: TEST_TENANTS.TENANT_A.id,
    tenantSlug: TEST_TENANTS.TENANT_A.slug,
    expectedCapabilities: ['grant_roles', 'revoke_roles', 'complete_onboarding', 'manage_staff'],
    expectedRestrictions: ['access_tenant_b', 'access_admin'],
  },

  /**
   * 🟡 STAFF_TENANT_A — Staff of Tenant A (limited admin)
   */
  STAFF_TENANT_A: {
    email: process.env.E2E_STAFF_EMAIL || 'staff@test.local',
    password: process.env.E2E_STAFF_PASSWORD || 'Test123!',
    role: 'STAFF_ORGANIZACAO',
    description: 'Tenant A staff - limited admin capabilities',
    tenantId: TEST_TENANTS.TENANT_A.id,
    tenantSlug: TEST_TENANTS.TENANT_A.slug,
    expectedCapabilities: ['grant_roles', 'revoke_roles'],
    expectedRestrictions: ['access_tenant_b', 'access_admin'],
  },

  /**
   * 🔵 ATHLETE_TENANT_A — Regular athlete in Tenant A
   */
  ATHLETE_TENANT_A: {
    email: process.env.E2E_ATHLETE_EMAIL || 'athlete@test.local',
    password: process.env.E2E_ATHLETE_PASSWORD || 'Test123!',
    role: 'ATLETA',
    description: 'Approved athlete in Tenant A - portal access only',
    tenantId: TEST_TENANTS.TENANT_A.id,
    tenantSlug: TEST_TENANTS.TENANT_A.slug,
    expectedCapabilities: ['access_portal', 'view_card', 'view_events'],
    expectedRestrictions: ['access_app', 'grant_roles', 'revoke_roles', 'access_tenant_b'],
  },

  /**
   * 🟢 ADMIN_TENANT_B — Admin of Tenant B (for isolation tests)
   */
  ADMIN_TENANT_B: {
    email: process.env.E2E_TENANT_B_ADMIN_EMAIL || 'admin-b@test.local',
    password: process.env.E2E_TENANT_B_ADMIN_PASSWORD || 'Test123!',
    role: 'ADMIN_TENANT',
    description: 'Tenant B admin - for cross-tenant isolation tests',
    tenantId: TEST_TENANTS.TENANT_B.id,
    tenantSlug: TEST_TENANTS.TENANT_B.slug,
    expectedCapabilities: ['grant_roles', 'revoke_roles'],
    expectedRestrictions: ['access_tenant_a', 'access_admin'],
  },

  /**
   * ⚪ ORPHAN_USER — Authenticated but no tenant/roles
   */
  ORPHAN_USER: {
    email: process.env.E2E_NO_CONTEXT_EMAIL || 'nocontext@test.local',
    password: process.env.E2E_NO_CONTEXT_PASSWORD || 'Test123!',
    role: 'NONE',
    description: 'Authenticated user without any tenant association',
    expectedCapabilities: ['access_join'],
    expectedRestrictions: ['access_app', 'access_portal', 'access_admin', 'grant_roles'],
  },

  /**
   * 🟠 USER_SINGLE_ROLE — User with exactly 1 role (orphan prevention test)
   */
  USER_SINGLE_ROLE: {
    email: process.env.E2E_SINGLE_ROLE_EMAIL || 'singlerole@test.local',
    password: process.env.E2E_SINGLE_ROLE_PASSWORD || 'Test123!',
    role: 'ATLETA',
    description: 'User with exactly one role - for orphan prevention tests',
    tenantId: TEST_TENANTS.TENANT_A.id,
    tenantSlug: TEST_TENANTS.TENANT_A.slug,
    expectedCapabilities: ['access_portal'],
    expectedRestrictions: ['become_orphan'],
  },

  /**
   * 🟠 ADMIN_INCOMPLETE_TENANT — Admin of incomplete onboarding tenant
   */
  ADMIN_INCOMPLETE_TENANT: {
    email: process.env.E2E_INCOMPLETE_ADMIN_EMAIL || 'admin-incomplete@test.local',
    password: process.env.E2E_INCOMPLETE_ADMIN_PASSWORD || 'Test123!',
    role: 'ADMIN_TENANT',
    description: 'Admin of tenant with incomplete onboarding',
    tenantId: TEST_TENANTS.TENANT_INCOMPLETE.id,
    tenantSlug: TEST_TENANTS.TENANT_INCOMPLETE.slug,
    expectedCapabilities: ['access_onboarding'],
    expectedRestrictions: ['access_full_app'],
  },
};

/**
 * Get persona by key
 */
export function getPersona(key: keyof typeof SECURITY_PERSONAS): SecurityPersona {
  const persona = SECURITY_PERSONAS[key];
  if (!persona) {
    throw new Error(`Security persona "${key}" not found`);
  }
  return persona;
}

/**
 * Get all personas for a specific tenant
 */
export function getPersonasForTenant(tenantId: string): SecurityPersona[] {
  return Object.values(SECURITY_PERSONAS).filter(p => p.tenantId === tenantId);
}
