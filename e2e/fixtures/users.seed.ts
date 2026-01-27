/**
 * 🧪 E2E Test Users Configuration
 * 
 * Defines test users for different roles and scenarios.
 * These users must exist in the test database.
 * 
 * IMPORTANT: In production, use dedicated test tenant and users.
 * Never use real user credentials in test files.
 */

export interface TestUser {
  email: string;
  password: string;
  role: 'SUPERADMIN' | 'TENANT_ADMIN' | 'TENANT_ADMIN_BLOCKED' | 'ATHLETE_APPROVED' | 'ATHLETE_PENDING' | 'NO_CONTEXT';
  tenantSlug?: string;
  expectedDestination: string | RegExp;
  description: string;
}

/**
 * Test tenant slug for E2E tests
 * This tenant must exist in the test database
 */
export const TEST_TENANT_SLUG = process.env.E2E_TEST_TENANT_SLUG || 'demo-bjj';

/**
 * Test users configuration
 * 
 * Password convention for test environment: Test123!
 * 
 * These users should be seeded in the test database with:
 * - Correct roles in user_roles table
 * - Correct tenant associations
 * - Correct membership status (for athletes)
 */
export const TEST_USERS: Record<string, TestUser> = {
  SUPERADMIN: {
    email: process.env.E2E_SUPERADMIN_EMAIL || 'superadmin@test.local',
    password: process.env.E2E_SUPERADMIN_PASSWORD || 'Test123!',
    role: 'SUPERADMIN',
    expectedDestination: '/admin',
    description: 'Global superadmin with access to /admin',
  },
  
  TENANT_ADMIN: {
    email: process.env.E2E_TENANT_ADMIN_EMAIL || 'admin@test.local',
    password: process.env.E2E_TENANT_ADMIN_PASSWORD || 'Test123!',
    role: 'TENANT_ADMIN',
    tenantSlug: TEST_TENANT_SLUG,
    expectedDestination: new RegExp(`/${TEST_TENANT_SLUG}/app`),
    description: 'Tenant admin with active billing',
  },
  
  TENANT_ADMIN_BLOCKED: {
    email: process.env.E2E_TENANT_ADMIN_BLOCKED_EMAIL || 'admin_blocked@test.local',
    password: process.env.E2E_TENANT_ADMIN_BLOCKED_PASSWORD || 'Test123!',
    role: 'TENANT_ADMIN_BLOCKED',
    tenantSlug: TEST_TENANT_SLUG,
    expectedDestination: new RegExp(`/${TEST_TENANT_SLUG}/app`), // Will show blocked UI
    description: 'Tenant admin with blocked billing',
  },
  
  ATHLETE_APPROVED: {
    email: process.env.E2E_ATHLETE_EMAIL || 'athlete@test.local',
    password: process.env.E2E_ATHLETE_PASSWORD || 'Test123!',
    role: 'ATHLETE_APPROVED',
    tenantSlug: TEST_TENANT_SLUG,
    expectedDestination: new RegExp(`/${TEST_TENANT_SLUG}/portal`),
    description: 'Approved athlete with ACTIVE membership',
  },
  
  ATHLETE_PENDING: {
    email: process.env.E2E_ATHLETE_PENDING_EMAIL || 'athlete_pending@test.local',
    password: process.env.E2E_ATHLETE_PENDING_PASSWORD || 'Test123!',
    role: 'ATHLETE_PENDING',
    tenantSlug: TEST_TENANT_SLUG,
    expectedDestination: new RegExp(`/${TEST_TENANT_SLUG}/membership/status`),
    description: 'Athlete with PENDING_REVIEW membership',
  },
  
  NO_CONTEXT: {
    email: process.env.E2E_NO_CONTEXT_EMAIL || 'nocontext@test.local',
    password: process.env.E2E_NO_CONTEXT_PASSWORD || 'Test123!',
    role: 'NO_CONTEXT',
    expectedDestination: '/portal', // Will show "no context" UI
    description: 'Authenticated user without any role or athlete record',
  },
};

/**
 * Validates that a test user exists and has required configuration
 */
export function validateTestUser(userKey: keyof typeof TEST_USERS): TestUser {
  const user = TEST_USERS[userKey];
  
  if (!user) {
    throw new Error(`Test user "${userKey}" is not configured`);
  }
  
  if (!user.email || !user.password) {
    throw new Error(`Test user "${userKey}" is missing email or password`);
  }
  
  return user;
}

/**
 * Gets all test users for validation
 */
export function getAllTestUsers(): TestUser[] {
  return Object.values(TEST_USERS);
}
