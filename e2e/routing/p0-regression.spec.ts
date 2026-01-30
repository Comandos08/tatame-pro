/**
 * 🔐 P1 — P0 ROUTING REGRESSION TESTS
 * 
 * Validates that critical routes from P0 never regress:
 * - No 404 on revenue-critical paths
 * - No improper redirects to /identity/wizard
 * - Public routes remain public
 * 
 * RUN: npx playwright test p0-regression
 */

import { test, expect, Page } from '@playwright/test';

const TEST_TENANT = process.env.E2E_TEST_TENANT_SLUG || 'federacao-demo';

// ===== HELPERS =====

/**
 * Assert: URL does NOT contain /identity/wizard
 * (improper redirect detection)
 */
async function expectNoWizardRedirect(page: Page, context: string) {
  const url = page.url();
  expect(
    url.includes('/identity/wizard'),
    `${context}: Improper redirect to /identity/wizard detected. URL: ${url}`
  ).toBe(false);
}

/**
 * Assert: Page does NOT show 404/NotFound content
 */
async function expectNotFoundAbsent(page: Page, context: string) {
  const notFoundIndicators = [
    page.locator('text=404'),
    page.locator('text=Page not found'),
    page.locator('text=Página não encontrada'),
    page.locator('[data-testid="not-found"]'),
  ];
  
  for (const indicator of notFoundIndicators) {
    const isVisible = await indicator.isVisible({ timeout: 1000 }).catch(() => false);
    expect(isVisible, `${context}: 404 indicator visible`).toBe(false);
  }
}

/**
 * Assert: No critical console errors
 * 
 * ALLOWLIST CRITERIA (P1 Robustez Ajuste 1):
 * - ResizeObserver: Browser timing noise
 * - net::ERR_BLOCKED_BY_CLIENT: Ad blockers
 * - chunk-: Vite HMR artifacts
 * - 426 Upgrade Required: WebSocket fallback (benign)
 * - favicon: Missing favicon is not critical
 * 
 * NOTE: Supabase errors are NOT filtered to catch real auth/RLS issues
 */
const BENIGN_ERROR_PATTERNS = [
  /ResizeObserver/i,
  /net::ERR_BLOCKED_BY_CLIENT/i,
  /chunk-.*\.js/i,
  /426.*Upgrade Required/i,
  /Failed to fetch.*favicon/i,
];

function expectNoConsoleErrors(errors: string[], context: string) {
  const criticalErrors = errors.filter(e => 
    !BENIGN_ERROR_PATTERNS.some(pattern => pattern.test(e))
  );
  
  expect(
    criticalErrors.length,
    `${context}: Critical JS errors found: ${criticalErrors.join(', ')}`
  ).toBe(0);
}

// ===== TESTS =====
// NOTA: Cada teste cria seu próprio listener de pageerror para evitar acúmulo

test.describe('🛡️ P0 Routing Regression Shield', () => {
  
  test('T1: Landing page opens without error or wizard redirect', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    
    await page.context().clearCookies();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    const heroContent = page.locator('text=/gerencie|organização|federation|martial/i');
    await expect(heroContent.first()).toBeVisible({ timeout: 10000 });
    
    await expectNoWizardRedirect(page, 'T1');
    await expectNotFoundAbsent(page, 'T1');
    expectNoConsoleErrors(consoleErrors, 'T1');
  });

  test('T2: Login page opens and does not redirect to wizard', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    
    await page.context().clearCookies();
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    
    const loginElement = page.locator('input[type="email"], input[type="password"], button:has-text(/entrar|login|sign in/i)');
    await expect(loginElement.first()).toBeVisible({ timeout: 10000 });
    
    await expectNoWizardRedirect(page, 'T2');
    await expectNotFoundAbsent(page, 'T2');
    expectNoConsoleErrors(consoleErrors, 'T2');
  });

  test('T3: Tenant landing opens (public)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    
    await page.context().clearCookies();
    await page.goto(`/${TEST_TENANT}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    await expectNoWizardRedirect(page, 'T3');
    await expectNotFoundAbsent(page, 'T3');
    expectNoConsoleErrors(consoleErrors, 'T3');
    
    const url = page.url();
    expect(url).toMatch(new RegExp(`/${TEST_TENANT}|/login`));
  });

  test('T4: Membership renew is public and opens (REVENUE-CRITICAL)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    
    await page.context().clearCookies();
    await page.goto(`/${TEST_TENANT}/membership/renew`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    await expectNoWizardRedirect(page, 'T4');
    await expectNotFoundAbsent(page, 'T4');
    expectNoConsoleErrors(consoleErrors, 'T4');
    
    const hasContent = await page.locator('body').textContent();
    expect(hasContent?.length).toBeGreaterThan(100);
  });

  test('T5: Verify routes are public', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    
    await page.context().clearCookies();
    
    const verifyRoutes = [
      `/${TEST_TENANT}/verify/card`,
      `/${TEST_TENANT}/verify/diploma`,
    ];
    
    for (const route of verifyRoutes) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      
      await expectNoWizardRedirect(page, `T5 (${route})`);
      await expectNotFoundAbsent(page, `T5 (${route})`);
      
      const url = page.url();
      expect(url).not.toContain('/login');
    }
    
    expectNoConsoleErrors(consoleErrors, 'T5');
  });

  // P1 Robustez Ajuste 2: Teste explicitamente restritivo contra /identity/wizard
  test('T6: Admin AppRouter protected route MUST redirect to /login, NEVER to /identity/wizard', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    
    await page.context().clearCookies();
    await page.goto(`/${TEST_TENANT}/app`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    const url = page.url();
    
    // CRITICAL: Explicit anti-wizard assertion FIRST
    expect(
      url.includes('/identity/wizard'),
      'CRITICAL: Unauthenticated admin route redirected to /identity/wizard instead of /login'
    ).toBe(false);
    
    // THEN assert correct behavior
    expect(url).toContain('/login');
    
    await expectNotFoundAbsent(page, 'T6');
    expectNoConsoleErrors(consoleErrors, 'T6');
  });
});

test.describe('🔒 Anti-Wizard Regression Shield', () => {
  test('Unauthenticated user never goes to /identity/wizard from public routes', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    
    await page.context().clearCookies();
    
    const publicRoutes = [
      '/',
      '/login',
      '/help',
      '/forgot-password',
      `/${TEST_TENANT}`,
      `/${TEST_TENANT}/login`,
      `/${TEST_TENANT}/membership/new`,
      `/${TEST_TENANT}/membership/adult`,
      `/${TEST_TENANT}/membership/renew`,
      `/${TEST_TENANT}/verify/card`,
      `/${TEST_TENANT}/academies`,
      `/${TEST_TENANT}/rankings`,
      `/${TEST_TENANT}/events`,
    ];
    
    for (const route of publicRoutes) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);
      
      await expectNoWizardRedirect(page, route);
    }
    
    expectNoConsoleErrors(consoleErrors, 'Anti-Wizard Shield');
  });
});
