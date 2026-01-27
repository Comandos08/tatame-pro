import { Page, expect } from '@playwright/test';
import { createTestSupabaseClient } from './supabaseTestClient';
import { TEST_USERS, TestUser, validateTestUser, TEST_TENANT_SLUG } from './users.seed';
import { 
  injectSessionCookies, 
  clearAuthSession, 
  waitForStableUrl, 
  detectRedirectLoop,
  validateDestination 
} from '../helpers/authSession';

/**
 * 🔐 Playwright Auth Fixtures
 * 
 * Provides real authentication fixtures for E2E tests.
 * Uses Supabase Auth with session injection (no UI login).
 * 
 * RULES:
 * ✅ Authenticate via Supabase signInWithPassword
 * ✅ Inject tokens as cookies/localStorage
 * ✅ Navigate to /portal (single decision point)
 * ✅ Validate correct destination
 * ❌ Never use login UI
 * ❌ Never redirect manually
 */

const supabase = createTestSupabaseClient();

/**
 * Core login function - authenticates and validates routing
 */
async function loginAsUser(page: Page, user: TestUser): Promise<void> {
  console.log(`🔐 Logging in as ${user.role}: ${user.email}`);
  
  // 1. Authenticate with Supabase
  const { data, error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  
  if (error || !data.session) {
    throw new Error(
      `❌ Authentication failed for ${user.role} (${user.email}):\n` +
      `  Error: ${error?.message || 'No session returned'}\n` +
      `  Hint: Ensure this user exists in the test database with correct password.`
    );
  }
  
  // 2. Navigate to base URL first (needed for cookie domain)
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  
  // 3. Inject session into browser
  await injectSessionCookies(page, data.session);
  
  // 4. Navigate to /portal (the single decision point)
  await page.goto('/portal');
  await page.waitForLoadState('networkidle');
  
  // 5. Wait for URL to stabilize
  const finalUrl = await waitForStableUrl(page);
  
  // 6. Detect any redirect loops
  const { hasLoop, history } = await detectRedirectLoop(page, 8, 3000);
  
  if (hasLoop) {
    throw new Error(
      `🔄 Redirect loop detected for ${user.role}:\n` +
      `  History: ${history.join(' → ')}`
    );
  }
  
  // 7. Validate destination
  validateDestination(finalUrl, user.expectedDestination, user.role);
  
  // 8. Verify page has content (no white screen)
  const body = page.locator('body');
  await expect(body).toBeVisible();
  const textContent = await body.textContent();
  
  if (!textContent || textContent.trim().length < 10) {
    throw new Error(
      `📄 White screen detected after login as ${user.role}:\n` +
      `  URL: ${finalUrl}\n` +
      `  Content length: ${textContent?.length || 0}`
    );
  }
  
  console.log(`✅ Successfully logged in as ${user.role} → ${finalUrl}`);
}

/**
 * Login as Global Superadmin
 * Expected destination: /admin
 */
export async function loginAsSuperAdmin(page: Page): Promise<void> {
  const user = validateTestUser('SUPERADMIN');
  await loginAsUser(page, user);
}

/**
 * Login as Tenant Admin (active billing)
 * Expected destination: /{tenant}/app
 */
export async function loginAsTenantAdmin(page: Page): Promise<void> {
  const user = validateTestUser('TENANT_ADMIN');
  await loginAsUser(page, user);
}

/**
 * Login as Tenant Admin with BLOCKED billing
 * Expected destination: /{tenant}/app (with blocked UI)
 */
export async function loginAsBlockedTenantAdmin(page: Page): Promise<void> {
  const user = validateTestUser('TENANT_ADMIN_BLOCKED');
  await loginAsUser(page, user);
  
  // Additional validation: should see blocked UI
  const blockedIndicator = page.locator('text=/bloqueado|blocked|suspenso/i');
  const isBlocked = await blockedIndicator.isVisible({ timeout: 3000 }).catch(() => false);
  
  if (!isBlocked) {
    console.warn('⚠️ Expected blocked UI but not detected. User may not have blocked billing status.');
  }
}

/**
 * Login as Approved Athlete
 * Expected destination: /{tenant}/portal
 */
export async function loginAsApprovedAthlete(page: Page): Promise<void> {
  const user = validateTestUser('ATHLETE_APPROVED');
  await loginAsUser(page, user);
}

/**
 * Login as Athlete with Pending Membership
 * Expected destination: /{tenant}/membership/status
 */
export async function loginAsPendingAthlete(page: Page): Promise<void> {
  const user = validateTestUser('ATHLETE_PENDING');
  await loginAsUser(page, user);
}

/**
 * Login as user without any context (no roles, no athlete record)
 * Expected destination: /portal (with "no context" UI)
 */
export async function loginAsNoContext(page: Page): Promise<void> {
  const user = validateTestUser('NO_CONTEXT');
  await loginAsUser(page, user);
  
  // Validate "no context" UI is shown
  const noContextIndicator = page.locator('text=/sem contexto|no context|sin contexto/i');
  const isNoContext = await noContextIndicator.isVisible({ timeout: 3000 }).catch(() => false);
  
  if (!isNoContext) {
    console.warn('⚠️ Expected "no context" UI but not detected.');
  }
}

/**
 * Logout current user
 * Clears all auth state and verifies redirect to /login
 */
export async function logout(page: Page): Promise<void> {
  console.log('🚪 Logging out...');
  
  // 1. Clear auth session
  await clearAuthSession(page);
  
  // 2. Sign out from Supabase
  await supabase.auth.signOut();
  
  // 3. Navigate to /portal (should redirect to /login)
  await page.goto('/portal');
  await page.waitForLoadState('networkidle');
  
  const finalUrl = await waitForStableUrl(page);
  
  // 4. Validate we're at login
  if (!finalUrl.includes('/login')) {
    throw new Error(
      `❌ Logout failed - expected /login but got: ${finalUrl}`
    );
  }
  
  console.log('✅ Successfully logged out');
}

/**
 * Validates that session survives page reload
 */
export async function validateSessionPersistence(page: Page, user: TestUser): Promise<void> {
  const urlBeforeReload = page.url();
  
  await page.reload();
  await page.waitForLoadState('networkidle');
  
  const urlAfterReload = await waitForStableUrl(page);
  
  // Should not redirect to login after reload
  if (urlAfterReload.includes('/login')) {
    throw new Error(
      `❌ Session lost after reload for ${user.role}:\n` +
      `  Before: ${urlBeforeReload}\n` +
      `  After: ${urlAfterReload}`
    );
  }
  
  // Check for redirect loops
  const { hasLoop } = await detectRedirectLoop(page, 5, 2000);
  
  if (hasLoop) {
    throw new Error(`🔄 Redirect loop detected after reload for ${user.role}`);
  }
}

/**
 * Quick auth helper - skips validation for faster tests
 * Use only when you need to quickly authenticate without full validation
 */
export async function quickLogin(page: Page, userKey: keyof typeof TEST_USERS): Promise<void> {
  const user = TEST_USERS[userKey];
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  
  if (error || !data.session) {
    throw new Error(`Quick login failed for ${userKey}: ${error?.message}`);
  }
  
  await page.goto('/');
  await injectSessionCookies(page, data.session);
}

// Export test users for reference
export { TEST_USERS, TEST_TENANT_SLUG };
