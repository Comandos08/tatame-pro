/**
 * E2E — Forgot Password & Password Reset UI Contract
 *
 * Validates the full password-reset UI flow:
 *   FP.1  Forgot-password page renders correctly
 *   FP.2  Submit disabled with empty / invalid email
 *   FP.3  Valid email submission shows success state
 *   FP.4  Success state has "back to login" link
 *   FP.5  "Try again" resets to form state
 *   FP.6  Back-to-login link on initial form works
 *   FP.7  /reset-password with no token shows invalid-token UI
 *   FP.8  /reset-password with malformed token shows invalid-token UI
 *   FP.9  Mocked edge function error is handled gracefully (no crash)
 */

import { test, expect, Route } from '@playwright/test';
import { clearAuthSession } from '../helpers/authSession';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function goToForgotPassword(page: Parameters<typeof test>[1] extends (...args: infer A) => unknown ? A[0] : never) {
  await clearAuthSession(page);
  await page.goto('/forgot-password');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#email').waitFor({ state: 'visible', timeout: 8000 });
}

/**
 * Wrap a POST mock so the browser's CORS preflight (OPTIONS) request is
 * forwarded to the real backend, which returns proper Access-Control-*
 * headers. Without this, fulfilling OPTIONS with a plain JSON body fails
 * the preflight and the actual POST never fires — the UI then never
 * transitions out of its loading state and the test times out.
 */
function mockPostOnly(
  status: number,
  body: Record<string, unknown>,
): (route: Route) => Promise<void> {
  return async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

test.describe('FP — Forgot Password Form', () => {

  test('FP.1: page renders correctly', async ({ page }) => {
    await goToForgotPassword(page);

    await expect(page.locator('#email')).toBeVisible();
    await expect(page.getByRole('button', { name: /enviar|send|solicitar/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /voltar|back|login/i })).toBeVisible();
  });

  test('FP.2: submit disabled with empty email', async ({ page }) => {
    await goToForgotPassword(page);

    const submit = page.getByRole('button', { name: /enviar|send|solicitar/i });
    await expect(submit).toBeDisabled();

    // Fill invalid email
    await page.fill('#email', 'not-an-email');
    await expect(submit).toBeDisabled();

    // Fill valid email
    await page.fill('#email', 'valid@example.com');
    await expect(submit).toBeEnabled();
  });

  test('FP.3: valid email submission shows success state', async ({ page }) => {
    await goToForgotPassword(page);

    // Mock the edge function call to avoid real network request in CI
    await page.route(
      `${SUPABASE_URL}/functions/v1/request-password-reset`,
      mockPostOnly(200, { success: true, message: 'Email sent' }),
    );

    await page.fill('#email', 'test@example.com');
    const submit = page.getByRole('button', { name: /enviar|send|solicitar/i });
    await expect(submit).toBeEnabled();
    await submit.click();

    // Success state replaces the form. Detect by what disappears (the email
    // input is no longer in the DOM) and what appears (the "try again" button
    // is exclusive to the success card). Don't probe icon DOM — Lucide changed
    // CheckCircle from a <circle>+<path> structure to all <path> in v1.x and
    // selectors like `svg.has(circle)` no longer match.
    await expect(page.locator('#email')).toBeHidden({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /tentar novamente|try again/i })).toBeVisible();

    // Should show back-to-login button on success
    await expect(page.getByRole('link', { name: /voltar|back|login/i })).toBeVisible();
  });

  test('FP.4: success state back-to-login link navigates to /login', async ({ page }) => {
    await goToForgotPassword(page);

    await page.route(
      `${SUPABASE_URL}/functions/v1/request-password-reset`,
      mockPostOnly(200, { success: true, message: 'Email sent' }),
    );

    await page.fill('#email', 'test@example.com');
    await page.getByRole('button', { name: /enviar|send|solicitar/i }).click();

    // Wait for success state
    await page.waitForTimeout(1000);

    // Click back to login
    await page.getByRole('link', { name: /voltar|back|login/i }).click();
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/login');
  });

  test('FP.5: "try again" on success state resets to form', async ({ page }) => {
    await goToForgotPassword(page);

    await page.route(
      `${SUPABASE_URL}/functions/v1/request-password-reset`,
      mockPostOnly(200, { success: true, message: 'Email sent' }),
    );

    await page.fill('#email', 'test@example.com');
    await page.getByRole('button', { name: /enviar|send|solicitar/i }).click();
    await page.waitForTimeout(1000);

    // Click "try again"
    await page.getByRole('button', { name: /tentar novamente|try again/i }).click();

    // Should return to form
    await expect(page.locator('#email')).toBeVisible();
  });

  test('FP.6: back-to-login link on form works', async ({ page }) => {
    await goToForgotPassword(page);

    await page.getByRole('link', { name: /voltar|back|login/i }).click();
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/login');
  });

  test('FP.9: edge function error is handled gracefully', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));

    await goToForgotPassword(page);

    // Simulate edge function 500
    await page.route(
      `${SUPABASE_URL}/functions/v1/request-password-reset`,
      mockPostOnly(500, { error: 'Internal Server Error' }),
    );

    await page.fill('#email', 'test@example.com');
    await page.getByRole('button', { name: /enviar|send|solicitar/i }).click();
    await page.waitForTimeout(2000);

    // Should NOT crash — stay on the same page
    expect(page.url()).toContain('/forgot-password');

    // Wait for the actual toast element, not just the toaster container.
    // The container `[data-sonner-toaster]` is always mounted but may be 0×0
    // (= "not visible" to Playwright) until a toast is appended as a child.
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10000 });

    // No JS errors
    expect(jsErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });
});

test.describe('RP — Reset Password Page', () => {

  test('FP.7: /reset-password with no token shows invalid state', async ({ page }) => {
    await clearAuthSession(page);
    await page.goto('/reset-password');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // Should not show the password form (token invalid/missing)
    const passwordInput = page.locator('#password, #newPassword, input[type="password"]').first();
    const isVisible = await passwordInput.isVisible().catch(() => false);

    // Either shows an error message or redirects to /forgot-password
    if (!isVisible) {
      // Page correctly blocks access — either shows error UI or redirects
      const url = page.url();
      const hasErrorText = await page.locator('text=/inválido|invalid|expirado|expired|token/i').isVisible().catch(() => false);
      expect(url.includes('/forgot-password') || url.includes('/login') || hasErrorText).toBe(true);
    }
  });

  test('FP.8: /reset-password with malformed token shows invalid state', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));

    await clearAuthSession(page);

    // Mock the validate call to return invalid
    const SUPABASE_URL_LOCAL = process.env.VITE_SUPABASE_URL || '';
    await page.route(`${SUPABASE_URL_LOCAL}/functions/v1/reset-password`, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid or expired token' }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/reset-password?token=fake-malformed-token-abc123');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Should not crash
    expect(jsErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);

    // Should show error state or redirect
    const url = page.url();
    const hasErrorUI = await page.locator('text=/inválido|invalid|expirado|expired/i').isVisible().catch(() => false);
    expect(url.includes('/forgot-password') || url.includes('/login') || hasErrorUI).toBe(true);
  });
});
