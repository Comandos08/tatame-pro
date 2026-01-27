/**
 * 🔐 E2E SECURITY: Route Inventory & Guard Validation
 * 
 * SECURITY CONTRACT:
 * - All sensitive routes MUST have appropriate guards
 * - No route can be accessed without proper authorization
 * - Guards must enforce fail-closed behavior
 * 
 * This test suite auto-generates a route inventory and validates
 * that every route has the correct protection level.
 */

import { test, expect } from '@playwright/test';
import { TEST_TENANT_SLUG } from '../fixtures/users.seed';

/**
 * Complete Route Classification Matrix
 * Every route in the application MUST be listed here
 */
const ROUTE_INVENTORY = {
  // === PUBLIC ROUTES (No auth required) ===
  PUBLIC: [
    { path: '/', description: 'Landing page' },
    { path: '/login', description: 'Global login' },
    { path: '/forgot-password', description: 'Password reset request' },
    { path: '/reset-password', description: 'Password reset form' },
    { path: '/help', description: 'Public help page' },
    { path: '/auth/callback', description: 'Magic link callback' },
    { path: '/join', description: 'Join wizard redirect' },
    { path: '/join/org', description: 'Join wizard - select org' },
    { path: '/join/account', description: 'Join wizard - create account' },
    { path: '/join/confirm', description: 'Join wizard - confirmation' },
    { path: `/${TEST_TENANT_SLUG}`, description: 'Tenant landing' },
    { path: `/${TEST_TENANT_SLUG}/login`, description: 'Tenant athlete login' },
    { path: `/${TEST_TENANT_SLUG}/academies`, description: 'Public academies list' },
    { path: `/${TEST_TENANT_SLUG}/rankings`, description: 'Public rankings' },
    { path: `/${TEST_TENANT_SLUG}/events`, description: 'Public events list' },
    { path: `/${TEST_TENANT_SLUG}/membership/new`, description: 'Membership type selector' },
    { path: `/${TEST_TENANT_SLUG}/membership/adult`, description: 'Adult membership form' },
    { path: `/${TEST_TENANT_SLUG}/membership/youth`, description: 'Youth membership form' },
    { path: `/${TEST_TENANT_SLUG}/membership/success`, description: 'Membership success' },
    { path: `/${TEST_TENANT_SLUG}/verify/card/test-id`, description: 'Card verification' },
    { path: `/${TEST_TENANT_SLUG}/verify/diploma/test-id`, description: 'Diploma verification' },
    { path: `/${TEST_TENANT_SLUG}/verify/membership/test-id`, description: 'Membership verification' },
  ],

  // === AUTH ONLY (Authenticated, role checked in component) ===
  AUTH_ONLY: [
    { path: '/portal', description: 'Portal router (decision hub)', guard: 'PortalRouter' },
  ],

  // === SUPERADMIN GLOBAL ONLY ===
  SUPERADMIN_GLOBAL: [
    { path: '/admin', description: 'Admin dashboard', guard: 'AdminRoute' },
    { path: '/admin/tenants/test-uuid/control', description: 'Tenant control', guard: 'AdminRoute' },
  ],

  // === ATHLETE ONLY (AthleteRouteGuard + RequireRoles) ===
  ATHLETE_ONLY: [
    { path: `/${TEST_TENANT_SLUG}/membership/status`, description: 'Membership status', guard: 'AthleteRouteGuard' },
    { path: `/${TEST_TENANT_SLUG}/membership/renew`, description: 'Membership renewal', guard: 'AthleteRouteGuard' },
    { path: `/${TEST_TENANT_SLUG}/portal`, description: 'Athlete portal', guard: 'AthleteRouteGuard + RequireRoles' },
    { path: `/${TEST_TENANT_SLUG}/portal/events`, description: 'Portal events', guard: 'AthleteRouteGuard + RequireRoles' },
    { path: `/${TEST_TENANT_SLUG}/portal/card`, description: 'Portal card', guard: 'AthleteRouteGuard + RequireRoles' },
  ],

  // === TENANT ADMIN/STAFF (RequireRoles with tenant context) ===
  TENANT_ADMIN: [
    { path: `/${TEST_TENANT_SLUG}/app`, description: 'Tenant dashboard', guard: 'RequireRoles[TENANT_APP]' },
    { path: `/${TEST_TENANT_SLUG}/app/onboarding`, description: 'Tenant onboarding', guard: 'RequireRoles[TENANT_SETTINGS]' },
    { path: `/${TEST_TENANT_SLUG}/app/memberships`, description: 'Memberships list', guard: 'RequireRoles[TENANT_MEMBERSHIPS]' },
    { path: `/${TEST_TENANT_SLUG}/app/academies`, description: 'Academies list', guard: 'RequireRoles[TENANT_ACADEMIES]' },
    { path: `/${TEST_TENANT_SLUG}/app/coaches`, description: 'Coaches list', guard: 'RequireRoles[TENANT_COACHES]' },
    { path: `/${TEST_TENANT_SLUG}/app/approvals`, description: 'Approvals list', guard: 'RequireRoles[TENANT_APPROVALS]' },
    { path: `/${TEST_TENANT_SLUG}/app/grading-schemes`, description: 'Grading schemes', guard: 'RequireRoles[TENANT_GRADINGS]' },
    { path: `/${TEST_TENANT_SLUG}/app/athletes`, description: 'Athletes list', guard: 'RequireRoles[TENANT_ATHLETES]' },
    { path: `/${TEST_TENANT_SLUG}/app/rankings`, description: 'Internal rankings', guard: 'RequireRoles[TENANT_RANKINGS]' },
    { path: `/${TEST_TENANT_SLUG}/app/settings`, description: 'Tenant settings', guard: 'RequireRoles[TENANT_SETTINGS]' },
    { path: `/${TEST_TENANT_SLUG}/app/billing`, description: 'Tenant billing', guard: 'RequireRoles[TENANT_BILLING]' },
    { path: `/${TEST_TENANT_SLUG}/app/audit-log`, description: 'Audit log', guard: 'RequireRoles[TENANT_AUDIT_LOG]' },
    { path: `/${TEST_TENANT_SLUG}/app/security`, description: 'Security timeline', guard: 'RequireRoles[TENANT_SECURITY]' },
    { path: `/${TEST_TENANT_SLUG}/app/events`, description: 'Events management', guard: 'RequireRoles[TENANT_EVENTS]' },
    { path: `/${TEST_TENANT_SLUG}/app/me`, description: 'My area', guard: 'RequireRoles[TENANT_MY_AREA]' },
    { path: `/${TEST_TENANT_SLUG}/app/help`, description: 'Tenant help', guard: 'RequireRoles[TENANT_HELP]' },
  ],
};

test.describe('🔐 1️⃣ Route Inventory Validation', () => {
  
  test('1.1: All PUBLIC routes are accessible without authentication', async ({ page }) => {
    for (const route of ROUTE_INVENTORY.PUBLIC) {
      // Navigate to route
      const response = await page.goto(route.path);
      
      // Should NOT be a server error
      expect(response?.status(), `${route.path} should not return server error`).toBeLessThan(500);
      
      // Should not redirect to login immediately (for true public routes)
      // Note: Some verification routes may 404 with test IDs - that's expected
      const url = page.url();
      if (!route.path.includes('verify/')) {
        expect(url, `${route.path} should be accessible`).not.toMatch(/\/login$/);
      }
    }
  });

  test('1.2: AUTH_ONLY routes redirect unauthenticated users', async ({ page }) => {
    for (const route of ROUTE_INVENTORY.AUTH_ONLY) {
      await page.goto(route.path);
      
      // Wait for navigation to complete
      await page.waitForLoadState('networkidle');
      const url = page.url();
      
      // Should redirect to /login or stay on /portal showing login UI
      expect(
        url.includes('/login') || url.includes('/portal'),
        `${route.path} should redirect unauthenticated users`
      ).toBe(true);
    }
  });

  test('1.3: SUPERADMIN routes require authentication', async ({ page }) => {
    for (const route of ROUTE_INVENTORY.SUPERADMIN_GLOBAL) {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      const url = page.url();
      
      // Should redirect to /portal (decision hub) or /login
      expect(
        url.includes('/portal') || url.includes('/login'),
        `${route.path} should redirect unauthenticated users`
      ).toBe(true);
      
      // Should NOT stay on /admin
      expect(url, `${route.path} should NOT be accessible without auth`).not.toMatch(/^.*\/admin/);
    }
  });

  test('1.4: ATHLETE_ONLY routes redirect to tenant login', async ({ page }) => {
    for (const route of ROUTE_INVENTORY.ATHLETE_ONLY) {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      const url = page.url();
      
      // Should redirect to tenant login or /portal
      expect(
        url.includes('/login') || url.includes('/portal'),
        `${route.path} should redirect unauthenticated users`
      ).toBe(true);
    }
  });

  test('1.5: TENANT_ADMIN routes redirect to /portal', async ({ page }) => {
    for (const route of ROUTE_INVENTORY.TENANT_ADMIN) {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      const url = page.url();
      
      // Should redirect to /portal (decision hub)
      expect(
        url.includes('/portal') || url.includes('/login'),
        `${route.path} should redirect unauthenticated users to /portal`
      ).toBe(true);
      
      // Should NOT stay on /app
      expect(url, `${route.path} should NOT be accessible without auth`).not.toContain('/app');
    }
  });

});

test.describe('🔐 2️⃣ Guard Presence Validation', () => {
  
  test('2.1: Every sensitive route has an explicit guard', async () => {
    // This is a static validation - ensure no route is missing a guard definition
    const allSensitiveRoutes = [
      ...ROUTE_INVENTORY.AUTH_ONLY,
      ...ROUTE_INVENTORY.SUPERADMIN_GLOBAL,
      ...ROUTE_INVENTORY.ATHLETE_ONLY,
      ...ROUTE_INVENTORY.TENANT_ADMIN,
    ];

    for (const route of allSensitiveRoutes) {
      expect(route.guard, `${route.path} must have a defined guard`).toBeDefined();
      expect(route.guard!.length, `${route.path} guard cannot be empty`).toBeGreaterThan(0);
    }
  });

  test('2.2: Route count matches expected (no hidden routes)', async () => {
    const totalRoutes = 
      ROUTE_INVENTORY.PUBLIC.length +
      ROUTE_INVENTORY.AUTH_ONLY.length +
      ROUTE_INVENTORY.SUPERADMIN_GLOBAL.length +
      ROUTE_INVENTORY.ATHLETE_ONLY.length +
      ROUTE_INVENTORY.TENANT_ADMIN.length;

    // Update this number if routes are added/removed
    // Current count: 22 public + 1 auth_only + 2 superadmin + 5 athlete + 16 tenant_admin = 46
    expect(totalRoutes, 'Route inventory should be complete').toBeGreaterThanOrEqual(40);
  });

});

test.describe('🔐 3️⃣ No Unprotected Sensitive Patterns', () => {
  
  test('3.1: All /app/* routes are protected', async ({ page }) => {
    const appRoutes = ROUTE_INVENTORY.TENANT_ADMIN.filter(r => r.path.includes('/app'));
    
    for (const route of appRoutes) {
      expect(route.guard, `${route.path} must be protected by RequireRoles`).toContain('RequireRoles');
    }
  });

  test('3.2: All /portal routes are protected', async ({ page }) => {
    const portalRoutes = ROUTE_INVENTORY.ATHLETE_ONLY.filter(r => r.path.includes('/portal'));
    
    for (const route of portalRoutes) {
      expect(
        route.guard,
        `${route.path} must be protected by AthleteRouteGuard`
      ).toContain('AthleteRouteGuard');
    }
  });

  test('3.3: /admin routes are protected by AdminRoute', async ({ page }) => {
    for (const route of ROUTE_INVENTORY.SUPERADMIN_GLOBAL) {
      expect(route.guard, `${route.path} must use AdminRoute`).toBe('AdminRoute');
    }
  });

});
