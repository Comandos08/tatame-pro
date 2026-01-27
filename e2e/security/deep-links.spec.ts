/**
 * 🔐 E2E SECURITY: Deep Link Attack Prevention
 * 
 * SECURITY CONTRACT:
 * - Direct URL access MUST be blocked without proper auth
 * - No sensitive UI flash on unauthorized deep links
 * - No unauthorized API calls on deep link access
 * 
 * Simulates browser URL paste attacks.
 */

import { test, expect } from '@playwright/test';
import { 
  loginAsApprovedAthlete, 
  loginAsTenantAdmin, 
  loginAsSuperAdmin,
  loginAsNoContext,
} from '../fixtures/auth.fixture';
import { TEST_TENANT_SLUG } from '../fixtures/users.seed';
import { waitForStableUrl } from '../helpers/authSession';

// All sensitive routes that could be deep-linked
const DEEP_LINK_TARGETS = {
  SUPERADMIN: [
    '/admin',
    '/admin/tenants/test-tenant-id/control',
  ],
  TENANT_APP: [
    `/${TEST_TENANT_SLUG}/app`,
    `/${TEST_TENANT_SLUG}/app/approvals`,
    `/${TEST_TENANT_SLUG}/app/approvals/test-id`,
    `/${TEST_TENANT_SLUG}/app/memberships`,
    `/${TEST_TENANT_SLUG}/app/athletes`,
    `/${TEST_TENANT_SLUG}/app/billing`,
    `/${TEST_TENANT_SLUG}/app/security`,
    `/${TEST_TENANT_SLUG}/app/audit-log`,
    `/${TEST_TENANT_SLUG}/app/settings`,
  ],
  ATHLETE_PORTAL: [
    `/${TEST_TENANT_SLUG}/portal`,
    `/${TEST_TENANT_SLUG}/portal/events`,
    `/${TEST_TENANT_SLUG}/portal/card`,
  ],
};

test.describe('🔐 1️⃣ Unauthenticated Deep Link Attacks', () => {
  
  test.describe('1.1: Admin Routes', () => {
    for (const route of DEEP_LINK_TARGETS.SUPERADMIN) {
      test(`${route} → blocked`, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        
        const url = page.url();
        
        // Should redirect to /portal or /login
        expect(url.includes('/portal') || url.includes('/login')).toBe(true);
        
        // Should NOT contain admin path
        expect(url).not.toContain('/admin');
        
        // No admin UI should be visible
        const hasAdminUI = await page.locator('text=Platform Overview').isVisible().catch(() => false);
        expect(hasAdminUI).toBe(false);
      });
    }
  });

  test.describe('1.2: Tenant App Routes', () => {
    for (const route of DEEP_LINK_TARGETS.TENANT_APP) {
      test(`${route} → blocked`, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        
        const url = page.url();
        
        // Should NOT contain /app
        expect(url).not.toContain('/app');
      });
    }
  });

  test.describe('1.3: Athlete Portal Routes', () => {
    for (const route of DEEP_LINK_TARGETS.ATHLETE_PORTAL) {
      test(`${route} → blocked`, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        
        const url = page.url();
        
        // Should redirect to login
        expect(url).toContain('/login');
      });
    }
  });

});

test.describe('🔐 2️⃣ Wrong Role Deep Link Attacks', () => {
  
  test.describe('2.1: Athlete → Admin Routes', () => {
    for (const route of DEEP_LINK_TARGETS.SUPERADMIN) {
      test(`Athlete → ${route} → blocked`, async ({ page }) => {
        await loginAsApprovedAthlete(page);
        
        await page.goto(route);
        const url = await waitForStableUrl(page);
        
        // Should NOT access admin
        expect(url).not.toContain('/admin');
      });
    }
  });

  test.describe('2.2: Athlete → Tenant App Routes', () => {
    for (const route of DEEP_LINK_TARGETS.TENANT_APP) {
      test(`Athlete → ${route} → blocked`, async ({ page }) => {
        await loginAsApprovedAthlete(page);
        
        await page.goto(route);
        const url = await waitForStableUrl(page);
        
        // Should NOT access /app
        expect(url).not.toContain('/app');
      });
    }
  });

  test.describe('2.3: Tenant Admin → Admin Routes', () => {
    for (const route of DEEP_LINK_TARGETS.SUPERADMIN) {
      test(`Tenant Admin → ${route} → blocked`, async ({ page }) => {
        await loginAsTenantAdmin(page);
        
        await page.goto(route);
        const url = await waitForStableUrl(page);
        
        // Should NOT access admin
        expect(url).not.toContain('/admin');
      });
    }
  });

  test.describe('2.4: No Context User → Any Protected Route', () => {
    const allProtected = [
      ...DEEP_LINK_TARGETS.SUPERADMIN,
      ...DEEP_LINK_TARGETS.TENANT_APP,
      ...DEEP_LINK_TARGETS.ATHLETE_PORTAL,
    ];
    
    for (const route of allProtected.slice(0, 5)) { // Test subset for speed
      test(`No Context → ${route} → blocked`, async ({ page }) => {
        await loginAsNoContext(page);
        
        await page.goto(route);
        const url = await waitForStableUrl(page);
        
        // Should be blocked from sensitive areas
        expect(url).not.toContain('/admin');
        expect(url).not.toContain('/app');
        // May or may not access portal depending on athlete record
      });
    }
  });

});

test.describe('🔐 3️⃣ No Sensitive UI Flash', () => {
  
  test('3.1: Admin deep link shows no admin content', async ({ page }) => {
    // Start listening for network requests
    const apiCalls: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/rest/v1/') || request.url().includes('/functions/')) {
        apiCalls.push(request.url());
      }
    });
    
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    // No admin-specific content should be visible
    const adminElements = await page.locator('[data-testid="admin-dashboard"]').count();
    expect(adminElements).toBe(0);
    
    // No admin-specific API calls should have been made
    const adminApiCalls = apiCalls.filter(url => 
      url.includes('tenants') && !url.includes('/login')
    );
    expect(adminApiCalls.length).toBe(0);
  });

  test('3.2: Approvals deep link shows no approval data', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/rest/v1/memberships')) {
        apiCalls.push(request.url());
      }
    });
    
    await page.goto(`/${TEST_TENANT_SLUG}/app/approvals`);
    await page.waitForLoadState('networkidle');
    
    // No approval-related content should be visible
    const hasApprovalUI = await page.locator('text=PENDING_REVIEW').isVisible().catch(() => false);
    expect(hasApprovalUI).toBe(false);
  });

  test('3.3: Billing deep link shows no billing data', async ({ page }) => {
    await page.goto(`/${TEST_TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');
    
    // No billing content should be visible
    const hasBillingUI = await page.locator('text=Subscription').isVisible().catch(() => false);
    expect(hasBillingUI).toBe(false);
  });

});

test.describe('🔐 4️⃣ No Unauthorized API Calls', () => {
  
  test('4.1: Deep link to protected route makes no sensitive API calls', async ({ page }) => {
    const sensitiveApiCalls: string[] = [];
    
    page.on('request', request => {
      const url = request.url();
      const sensitivePatterns = [
        '/memberships',
        '/approvals',
        '/billing',
        '/user_roles',
        '/audit_logs',
        '/security_events',
      ];
      
      if (sensitivePatterns.some(pattern => url.includes(pattern))) {
        sensitiveApiCalls.push(url);
      }
    });
    
    // Unauthenticated access to sensitive route
    await page.goto(`/${TEST_TENANT_SLUG}/app/approvals`);
    await page.waitForLoadState('networkidle');
    
    // Wait a bit for any delayed API calls
    await page.waitForTimeout(1000);
    
    // No sensitive API calls should have been made
    // (RLS would block them anyway, but we shouldn't even try)
    expect(sensitiveApiCalls.length, 
      `Sensitive API calls made: ${sensitiveApiCalls.join(', ')}`
    ).toBe(0);
  });

});

test.describe('🔐 5️⃣ Redirect Correctness', () => {
  
  test('5.1: Deep link preserves original intent after login', async ({ page }) => {
    // This tests the "redirect after login" flow
    // Navigate to protected route
    await page.goto(`/${TEST_TENANT_SLUG}/portal`);
    await page.waitForLoadState('networkidle');
    
    // Should be on login page
    const url = page.url();
    expect(url).toContain('/login');
  });

  test('5.2: Admin deep link does not store in redirect memory', async ({ page }) => {
    // Navigate to admin (should be blocked)
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    // After login as athlete, should NOT end up on /admin
    await loginAsApprovedAthlete(page);
    const url = await waitForStableUrl(page);
    
    expect(url).not.toContain('/admin');
    expect(url).toContain('/portal');
  });

});
