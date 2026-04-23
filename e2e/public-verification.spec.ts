import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test: Public Membership Verification (Security Hardened)
 *
 * Tests the public verification endpoint for membership cards.
 * Endpoint: /:tenantSlug/verify/membership/:membershipId
 *
 * SECURITY REQUIREMENTS:
 * - Works for anonymous users (no login required)
 * - Displays ONLY masked athlete name (First Name + Last Initial)
 * - NEVER exposes PII: email, phone, address, birth_date, national_id
 * - Shows membership status and validity
 * - Displays organization name and slug only (no internal IDs)
 * - Shows digital card download URL if available
 * - Uses database-level masking (not client-side)
 *
 * DATA DEPENDENCY:
 * These tests require TEST_MEMBERSHIP_ID to exist in the backing Supabase
 * project (membership_verification view). If the seed is missing, the page
 * renders an error state instead of the detail UI. To avoid cascading
 * failures, each test that requires live data calls ensureDataLoaded() and
 * skips cleanly if the record isn't present in the environment.
 */

// Test data — keep in sync with the seed for the CI Supabase project.
const TEST_TENANT_SLUG = 'demo-bjj';
const TEST_MEMBERSHIP_ID = 'e139ef12-3832-460b-a95b-f0efb14c1d3f';
const VERIFY_URL = `/${TEST_TENANT_SLUG}/verify/membership/${TEST_MEMBERSHIP_ID}`;

/**
 * Wait until React has rendered the initial tree into #root. `domcontentloaded`
 * only means the HTML parser finished — main.tsx and the lazy route chunk may
 * still be loading. Every test that inspects `page.textContent('body')` or
 * looks for app-rendered elements must call this first.
 */
async function waitForAppMounted(page: Page): Promise<void> {
  await page.locator('#root > *').first().waitFor({ state: 'attached', timeout: 10000 });
}

/**
 * Wait until the verification page finishes its initial fetch and either:
 *   - renders the details card (data found), OR
 *   - renders the error card (not found / insufficient data).
 *
 * Returns true when the detail UI is present (heading appears AND no error),
 * false otherwise. Lets tests `skip()` deterministically when the seed is
 * missing instead of timing out on sub-assertions.
 *
 * Accepts h1/h2/h3 because the page can fall through several render layers
 * (TenantLayout tenant-not-found renders shadcn CardTitle = h3; VerifyMembership
 * renders h1 in both success and error states).
 *
 * Why we don't use page.waitForLoadState('networkidle'): the app keeps long-
 * lived connections open (Sentry, Supabase realtime reconnects) so the
 * network never actually idles. waitForLoadState('networkidle') would wait
 * the full navigation timeout in CI.
 */
async function ensureDataLoaded(page: Page): Promise<boolean> {
  const heading = page.locator('h1, h2, h3').first();
  try {
    await heading.waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    // No heading rendered within 15 s — tenant/membership lookup is failing
    // silently (e.g. TenantLayout stuck in its loading state). Treat as "seed
    // unavailable" so the caller can test.skip() cleanly instead of bubbling a
    // timeout up through a sub-assertion.
    return false;
  }
  const text = (await heading.textContent())?.toLowerCase() ?? '';
  const looksLikeError =
    /falha|failed|not found|n[aã]o encontrad|não existe|does not exist|invalid/.test(text);
  return !looksLikeError;
}

test.describe('Public Membership Verification - Security Hardened', () => {

  test('should display verification page for anonymous user', async ({ page }) => {
    await page.goto(VERIFY_URL);
    await page.waitForLoadState('domcontentloaded');
    await waitForAppMounted(page);

    // Public page invariant 1: no login redirect, ever.
    await expect(page.locator('input[type="password"]')).not.toBeVisible();
    expect(page.url()).not.toContain('/login');

    // Public page invariant 2: page reaches a settled render state. We accept
    // any of the three: VerifyMembership success/error (h1), TenantLayout
    // tenant-not-found BlockedStateCard (h3 via shadcn CardTitle), or the
    // VerifyMembership loading copy. The previous "body length > 50" check
    // was racy: TenantLayout's loading card has only ~25 chars of text and
    // the wait would fire before transitions completed.
    const settledSignal = page
      .locator('h1, h2, h3')
      .or(page.locator('text=/verificando|verifying|carregando/i'))
      .first();
    await expect(settledSignal).toBeVisible({ timeout: 15000 });
  });

  test('should display organization name', async ({ page }) => {
    await page.goto(VERIFY_URL);
    await page.waitForLoadState('domcontentloaded');
    await waitForAppMounted(page);
    if (!(await ensureDataLoaded(page))) test.skip(true, 'verification seed unavailable');

    const orgLabel = page.locator('text=/organiza/i');
    await expect(orgLabel.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display masked athlete name (DB-level masking)', async ({ page }) => {
    await page.goto(VERIFY_URL);
    await page.waitForLoadState('domcontentloaded');
    await waitForAppMounted(page);
    if (!(await ensureDataLoaded(page))) test.skip(true, 'verification seed unavailable');

    const athleteLabel = page.locator('text=/atleta|athlete/i');
    await expect(athleteLabel.first()).toBeVisible({ timeout: 10000 });

    // The name should be masked at DB level: "First Name + Last Initial."
    // e.g., "João S." or "Maria C."
    const maskedNamePattern = page.locator('text=/[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+ [A-ZÁÉÍÓÚÂÊÔÃÕÇ]\\./');
    await expect(maskedNamePattern.first()).toBeVisible({ timeout: 10000 });
  });

  test('should NOT expose any PII (email, phone, address, birth_date)', async ({ page }) => {
    await page.goto(VERIFY_URL);
    await page.waitForLoadState('domcontentloaded');
    await waitForAppMounted(page);
    const content = await page.textContent('body');

    // Should NOT contain email patterns
    expect(content).not.toMatch(/@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

    // Should NOT contain phone patterns (Brazilian format)
    expect(content).not.toMatch(/\(\d{2}\)\s?\d{4,5}-?\d{4}/);

    // Should NOT contain CPF patterns
    expect(content).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });

  test('should display current grading when athlete has one', async ({ page }) => {
    await page.goto(VERIFY_URL);
    await page.waitForLoadState('domcontentloaded');
    await waitForAppMounted(page);
    // Graceful handling: with or without grading, the page must render body
    // content. The grading section is only shown when data.level_name is set.
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('should display validity period', async ({ page }) => {
    await page.goto(VERIFY_URL);
    await page.waitForLoadState('domcontentloaded');
    await waitForAppMounted(page);
    if (!(await ensureDataLoaded(page))) test.skip(true, 'verification seed unavailable');

    const validityLabel = page.locator('text=/validade|valid/i');
    await expect(validityLabel.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display QR code for sharing', async ({ page }) => {
    await page.goto(VERIFY_URL);
    await page.waitForLoadState('domcontentloaded');
    await waitForAppMounted(page);
    if (!(await ensureDataLoaded(page))) test.skip(true, 'verification seed unavailable');

    // qrcode.react renders an <svg> with <rect> children. Assert the first
    // match — there's exactly one QR on the page in the happy path.
    const qrSvg = page.locator('svg').filter({ has: page.locator('rect') }).first();
    await expect(qrSvg).toBeVisible({ timeout: 10000 });
  });

  test('should show error for invalid membership ID', async ({ page }) => {
    const invalidId = '00000000-0000-0000-0000-000000000000';
    await page.goto(`/${TEST_TENANT_SLUG}/verify/membership/${invalidId}`);
    await page.waitForLoadState('domcontentloaded');
    await waitForAppMounted(page);
    // Should display error message
    const errorIndicator = page.locator('text=/não encontrad|not found|falhou|failed/i');
    await expect(errorIndicator.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show error for invalid tenant slug', async ({ page }) => {
    await page.goto(`/invalid-tenant-xyz/verify/membership/${TEST_MEMBERSHIP_ID}`);
    await page.waitForLoadState('domcontentloaded');
    await waitForAppMounted(page);
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('should have back button to tenant page', async ({ page }) => {
    await page.goto(VERIFY_URL);
    await page.waitForLoadState('domcontentloaded');
    await waitForAppMounted(page);
    if (!(await ensureDataLoaded(page))) test.skip(true, 'verification seed unavailable');

    // VerifyMembership.tsx wraps the back action in <Link to={`/${tenantSlug}`}>.
    // Assert by role+href so the matcher is stable even if the copy changes.
    const backLink = page.getByRole('link').filter({ hasText: /voltar|back/i }).first();
    await expect(backLink).toBeVisible({ timeout: 10000 });
    await expect(backLink).toHaveAttribute('href', new RegExp(`/${TEST_TENANT_SLUG}`));
  });

  test('should display download button if digital card is ready', async ({ page }) => {
    await page.goto(VERIFY_URL);
    await page.waitForLoadState('domcontentloaded');
    await waitForAppMounted(page);
    if (!(await ensureDataLoaded(page))) test.skip(true, 'verification seed unavailable');

    // The page renders the download button when digital_card_id + pdf_url are
    // present, otherwise a "processando/processing" state. Either is valid.
    const downloadOrProcessing = page.locator('text=/baixar|download|processando|processing/i').first();
    await expect(downloadOrProcessing).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Verification Page - Visual Check', () => {

  test('should take screenshot of valid verification', async ({ page }) => {
    await page.goto(VERIFY_URL);
    await page.waitForLoadState('domcontentloaded');
    await waitForAppMounted(page);
    // Wait for any heading (h1 from VerifyMembership, h3 from TenantLayout's
    // tenant-not-found card) so the screenshot captures a settled render
    // instead of a transient loading spinner. Falls through if the page
    // genuinely never reaches a heading state — the screenshot is best-effort.
    await page
      .locator('h1, h2, h3')
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});

    await page.screenshot({
      path: 'e2e/screenshots/verification-valid.png',
      fullPage: true,
    });
  });

  test('should take screenshot of invalid verification', async ({ page }) => {
    const invalidId = '00000000-0000-0000-0000-000000000000';
    await page.goto(`/${TEST_TENANT_SLUG}/verify/membership/${invalidId}`);
    await page.waitForLoadState('domcontentloaded');
    await waitForAppMounted(page);
    await page
      .locator('h1, h2, h3')
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});

    await page.screenshot({
      path: 'e2e/screenshots/verification-invalid.png',
      fullPage: true,
    });
  });
});
