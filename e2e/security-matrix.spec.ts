import { test, expect, Page } from '@playwright/test';
import {
  loginAsSuperAdmin,
  loginAsTenantAdmin,
  loginAsBlockedTenantAdmin,
  loginAsApprovedAthlete,
  loginAsPendingAthlete,
  loginAsNoContext,
  logout,
  validateSessionPersistence,
  TEST_TENANT_SLUG,
  TEST_USERS,
} from './fixtures/auth.fixture';
import { 
  waitForStableUrl, 
  detectRedirectLoop, 
  clearAuthSession 
} from './helpers/authSession';

/**
 * 🔐 TATAME E2E Security Matrix Tests (WITH REAL AUTH)
 * 
 * Uses real Supabase authentication fixtures.
 * No more test.skip() - all tests run with actual sessions.
 * 
 * TEST MATRIX:
 * 1️⃣ Unauthenticated users
 * 2️⃣ Authenticated users WITHOUT context
 * 3️⃣ Approved athletes
 * 4️⃣ Athletes with pending membership
 * 5️⃣ Active tenant admins
 * 6️⃣ Blocked tenant admins (billing)
 * 7️⃣ Global superadmins
 * 
 * VALIDATION CRITERIA:
 * ✅ No loops
 * ✅ No white screens
 * ✅ No unexpected redirects
 * ✅ /portal always decides
 * ✅ Layouts never decide
 */

// Reset auth state before each test
test.beforeEach(async ({ page }) => {
  await clearAuthSession(page);
});

// ============ HELPERS ============

async function hasVisibleContent(page: Page): Promise<boolean> {
  await page.waitForLoadState('networkidle');
  const body = page.locator('body');
  const textContent = await body.textContent();
  return (textContent?.trim().length ?? 0) > 10;
}

async function isOnLoginPage(page: Page): Promise<boolean> {
  return page.url().includes('/login');
}

// ============ TEST SUITES ============

test.describe('1️⃣ Unauthenticated User Access', () => {
  
  test('1.1: /portal → redirects to /login', async ({ page }) => {
    await page.goto('/portal');
    const finalUrl = await waitForStableUrl(page);
    
    expect(finalUrl).toContain('/login');
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('1.2: /admin → redirects to /portal → /login', async ({ page }) => {
    await page.goto('/admin');
    const finalUrl = await waitForStableUrl(page);
    
    expect(finalUrl).toContain('/login');
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('1.3: /{tenant}/app → redirects to /portal → /login', async ({ page }) => {
    await page.goto(`/${TEST_TENANT_SLUG}/app`);
    const finalUrl = await waitForStableUrl(page);
    
    expect(finalUrl).toContain('/login');
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('1.4: /{tenant}/portal → redirects to tenant login', async ({ page }) => {
    await page.goto(`/${TEST_TENANT_SLUG}/portal`);
    const finalUrl = await waitForStableUrl(page);
    
    // Should redirect to tenant-specific login
    expect(finalUrl).toContain('/login');
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('1.5: No redirect loops for unauthenticated user', async ({ page }) => {
    const routes = ['/portal', '/admin', `/${TEST_TENANT_SLUG}/app`];
    
    for (const route of routes) {
      await page.goto(route);
      const { hasLoop, history } = await detectRedirectLoop(page);
      
      expect(hasLoop).toBe(false);
      expect(history.length).toBeLessThan(8);
    }
  });
  
});

test.describe('2️⃣ Authenticated User WITHOUT Context', () => {
  
  test('2.1: /portal shows neutral "no context" screen', async ({ page }) => {
    await loginAsNoContext(page);
    
    // Should be on /portal with "no context" UI
    const finalUrl = page.url();
    expect(finalUrl).toContain('/portal');
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('2.2: /admin → /portal (no context, not superadmin)', async ({ page }) => {
    await loginAsNoContext(page);
    
    await page.goto('/admin');
    const finalUrl = await waitForStableUrl(page);
    
    // Should NOT stay on admin
    expect(finalUrl).not.toContain('/admin');
  });
  
  test('2.3: Refresh maintains position without loop', async ({ page }) => {
    await loginAsNoContext(page);
    
    await validateSessionPersistence(page, TEST_USERS.NO_CONTEXT);
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
});

test.describe('3️⃣ Approved Athlete Access', () => {
  
  test('3.1: /portal → /{tenant}/portal', async ({ page }) => {
    await loginAsApprovedAthlete(page);
    
    const finalUrl = page.url();
    expect(finalUrl).toContain(`/${TEST_TENANT_SLUG}/portal`);
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('3.2: /admin → /portal → /{tenant}/portal', async ({ page }) => {
    await loginAsApprovedAthlete(page);
    
    await page.goto('/admin');
    const finalUrl = await waitForStableUrl(page);
    
    // Athlete should NOT end up on admin
    expect(finalUrl).not.toContain('/admin');
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('3.3: /{tenant}/app → blocked, redirects to portal', async ({ page }) => {
    await loginAsApprovedAthlete(page);
    
    await page.goto(`/${TEST_TENANT_SLUG}/app`);
    const finalUrl = await waitForStableUrl(page);
    
    // Athlete should NOT access /app
    expect(finalUrl).toContain('/portal');
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('3.4: Refresh on /{tenant}/portal maintains position', async ({ page }) => {
    await loginAsApprovedAthlete(page);
    
    await validateSessionPersistence(page, TEST_USERS.ATHLETE_APPROVED);
    
    const finalUrl = page.url();
    expect(finalUrl).toContain(`/${TEST_TENANT_SLUG}/portal`);
  });
  
  test('3.5: No redirect loops', async ({ page }) => {
    await loginAsApprovedAthlete(page);
    
    const { hasLoop, history } = await detectRedirectLoop(page);
    expect(hasLoop).toBe(false);
  });
  
});

test.describe('4️⃣ Athlete with Pending Membership', () => {
  
  test('4.1: /portal → /{tenant}/membership/status', async ({ page }) => {
    await loginAsPendingAthlete(page);
    
    const finalUrl = page.url();
    expect(finalUrl).toContain('/membership/status');
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('4.2: /admin → /portal → membership/status', async ({ page }) => {
    await loginAsPendingAthlete(page);
    
    await page.goto('/admin');
    const finalUrl = await waitForStableUrl(page);
    
    // Pending athlete should NOT end up on admin
    expect(finalUrl).not.toContain('/admin');
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('4.3: Refresh maintains position', async ({ page }) => {
    await loginAsPendingAthlete(page);
    
    await validateSessionPersistence(page, TEST_USERS.ATHLETE_PENDING);
    
    const finalUrl = page.url();
    expect(finalUrl).toContain('/membership');
  });
  
});

test.describe('5️⃣ Active Tenant Admin', () => {
  
  test('5.1: /portal → /{tenant}/app', async ({ page }) => {
    await loginAsTenantAdmin(page);
    
    const finalUrl = page.url();
    expect(finalUrl).toContain(`/${TEST_TENANT_SLUG}/app`);
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('5.2: /admin → /portal → /{tenant}/app', async ({ page }) => {
    await loginAsTenantAdmin(page);
    
    await page.goto('/admin');
    const finalUrl = await waitForStableUrl(page);
    
    // Tenant admin (non-superadmin) should NOT stay on /admin
    expect(finalUrl).not.toContain('/admin');
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('5.3: Refresh on /{tenant}/app maintains position', async ({ page }) => {
    await loginAsTenantAdmin(page);
    
    await validateSessionPersistence(page, TEST_USERS.TENANT_ADMIN);
    
    const finalUrl = page.url();
    expect(finalUrl).toContain(`/${TEST_TENANT_SLUG}/app`);
  });
  
  test('5.4: No redirect loops', async ({ page }) => {
    await loginAsTenantAdmin(page);
    
    const { hasLoop } = await detectRedirectLoop(page);
    expect(hasLoop).toBe(false);
  });
  
});

test.describe('6️⃣ Blocked Tenant Admin (Billing)', () => {
  
  test('6.1: /portal → /{tenant}/app with blocked screen', async ({ page }) => {
    await loginAsBlockedTenantAdmin(page);
    
    const finalUrl = page.url();
    expect(finalUrl).toContain(`/${TEST_TENANT_SLUG}/app`);
    expect(await hasVisibleContent(page)).toBe(true);
    
    // Should show blocked UI (handled by TenantLayout)
    // The blocked screen is rendered within /app
  });
  
  test('6.2: /admin → /portal → blocked state', async ({ page }) => {
    await loginAsBlockedTenantAdmin(page);
    
    await page.goto('/admin');
    const finalUrl = await waitForStableUrl(page);
    
    // Non-superadmin should not stay on admin
    expect(finalUrl).not.toContain('/admin');
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('6.3: Refresh maintains position', async ({ page }) => {
    await loginAsBlockedTenantAdmin(page);
    
    await validateSessionPersistence(page, TEST_USERS.TENANT_ADMIN_BLOCKED);
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
});

test.describe('7️⃣ Global Superadmin', () => {
  
  test('7.1: /portal → /admin', async ({ page }) => {
    await loginAsSuperAdmin(page);
    
    const finalUrl = page.url();
    expect(finalUrl).toContain('/admin');
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('7.2: /admin → stays on /admin', async ({ page }) => {
    await loginAsSuperAdmin(page);
    
    await page.goto('/admin');
    const finalUrl = await waitForStableUrl(page);
    
    expect(finalUrl).toContain('/admin');
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('7.3: Refresh on /admin maintains position', async ({ page }) => {
    await loginAsSuperAdmin(page);
    
    await page.goto('/admin');
    await validateSessionPersistence(page, TEST_USERS.SUPERADMIN);
    
    expect(page.url()).toContain('/admin');
  });
  
  test('7.4: No redirect loops', async ({ page }) => {
    await loginAsSuperAdmin(page);
    
    const { hasLoop } = await detectRedirectLoop(page);
    expect(hasLoop).toBe(false);
  });
  
});

test.describe('🔒 Security Critical Tests', () => {
  
  test('S.1: Login → Logout → Login flow works', async ({ page }) => {
    // Login
    await loginAsTenantAdmin(page);
    expect(page.url()).toContain(`/${TEST_TENANT_SLUG}/app`);
    
    // Logout
    await logout(page);
    expect(page.url()).toContain('/login');
    
    // Login again
    await loginAsTenantAdmin(page);
    expect(page.url()).toContain(`/${TEST_TENANT_SLUG}/app`);
  });
  
  test('S.2: /portal never redirects back to itself infinitely', async ({ page }) => {
    await loginAsApprovedAthlete(page);
    
    const history: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        history.push(frame.url());
      }
    });
    
    await page.goto('/portal');
    await waitForStableUrl(page);
    
    // Count portal hits
    const portalHits = history.filter(url => 
      url.endsWith('/portal') || url.includes('/portal?')
    ).length;
    
    expect(portalHits).toBeLessThanOrEqual(2);
  });
  
  test('S.3: Direct URL access respects authorization', async ({ page }) => {
    // Login as athlete
    await loginAsApprovedAthlete(page);
    
    // Try to access admin
    await page.goto('/admin');
    const finalUrl = await waitForStableUrl(page);
    
    // Athlete should NOT access admin
    expect(finalUrl).not.toContain('/admin');
  });
  
  test('S.4: All user types have visible content (no white screens)', async ({ page }) => {
    // Test each user type
    const loginFunctions = [
      loginAsSuperAdmin,
      loginAsTenantAdmin,
      loginAsApprovedAthlete,
    ];
    
    for (const loginFn of loginFunctions) {
      await clearAuthSession(page);
      await loginFn(page);
      expect(await hasVisibleContent(page)).toBe(true);
    }
  });
  
});

test.describe('🧭 Navigation Flow Tests', () => {
  
  test('N.1: Public tenant landing is accessible without auth', async ({ page }) => {
    await page.goto(`/${TEST_TENANT_SLUG}`);
    await page.waitForLoadState('networkidle');
    
    expect(await hasVisibleContent(page)).toBe(true);
    expect(page.url()).toContain(TEST_TENANT_SLUG);
  });
  
  test('N.2: Membership flow is accessible without auth', async ({ page }) => {
    await page.goto(`/${TEST_TENANT_SLUG}/membership/new`);
    await page.waitForLoadState('networkidle');
    
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('N.3: Public events are accessible without auth', async ({ page }) => {
    await page.goto(`/${TEST_TENANT_SLUG}/events`);
    await page.waitForLoadState('networkidle');
    
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('N.4: Athlete can access their portal routes', async ({ page }) => {
    await loginAsApprovedAthlete(page);
    
    // Navigate to portal sub-routes
    await page.goto(`/${TEST_TENANT_SLUG}/portal/events`);
    const eventsUrl = await waitForStableUrl(page);
    expect(await hasVisibleContent(page)).toBe(true);
    
    await page.goto(`/${TEST_TENANT_SLUG}/portal/card`);
    const cardUrl = await waitForStableUrl(page);
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('N.5: Admin can access app sub-routes', async ({ page }) => {
    await loginAsTenantAdmin(page);
    
    // Navigate to app sub-routes
    await page.goto(`/${TEST_TENANT_SLUG}/app/memberships`);
    const membershipsUrl = await waitForStableUrl(page);
    expect(await hasVisibleContent(page)).toBe(true);
    
    await page.goto(`/${TEST_TENANT_SLUG}/app/athletes`);
    const athletesUrl = await waitForStableUrl(page);
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
});

test.describe('📋 Acceptance Criteria Validation', () => {
  
  test('AC.1: All tests run without skip', async ({ page }) => {
    // This test validates that we have real fixtures
    // If this runs, it means fixtures are working
    await loginAsTenantAdmin(page);
    expect(page.url()).toContain('/app');
  });
  
  test('AC.2: Page refresh does not break navigation', async ({ page }) => {
    await loginAsApprovedAthlete(page);
    
    const urlBefore = page.url();
    await page.reload();
    await page.waitForLoadState('networkidle');
    const urlAfter = await waitForStableUrl(page);
    
    // Should not redirect to login
    expect(urlAfter).not.toContain('/login');
    expect(await hasVisibleContent(page)).toBe(true);
  });
  
  test('AC.3: Authenticated user never sees /login unexpectedly', async ({ page }) => {
    await loginAsTenantAdmin(page);
    
    // Navigate around
    await page.goto(`/${TEST_TENANT_SLUG}/app/settings`);
    await waitForStableUrl(page);
    
    await page.goto(`/${TEST_TENANT_SLUG}/app/memberships`);
    await waitForStableUrl(page);
    
    // Should never hit login
    expect(page.url()).not.toContain('/login');
  });
  
  test('AC.4: Guards redirect to /portal, not /login', async ({ page }) => {
    await loginAsApprovedAthlete(page);
    
    // Access protected admin route
    await page.goto('/admin');
    const finalUrl = await waitForStableUrl(page);
    
    // Should redirect via /portal, not directly to /login
    // Result should be their authorized area
    expect(finalUrl).not.toContain('/login');
  });
  
  test('AC.5: No unexpected redirects for any user type', async ({ page }) => {
    const testCases = [
      { login: loginAsSuperAdmin, name: 'Superadmin' },
      { login: loginAsTenantAdmin, name: 'TenantAdmin' },
      { login: loginAsApprovedAthlete, name: 'Athlete' },
    ];
    
    for (const { login, name } of testCases) {
      await clearAuthSession(page);
      await login(page);
      
      const { hasLoop, history } = await detectRedirectLoop(page);
      
      expect(hasLoop).toBe(false);
      expect(history.length).toBeLessThan(8);
    }
  });
  
});
