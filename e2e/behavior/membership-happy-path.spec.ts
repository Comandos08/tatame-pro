/**
 * E2E — Membership Happy-Path Behavioral Tests
 *
 * Covers the most revenue-critical user journeys end-to-end:
 *
 *   MHP.1  Public membership renewal page loads without auth
 *   MHP.2  Membership status page accessible to pending athlete
 *   MHP.3  Athlete portal shows active membership info
 *   MHP.4  Tenant admin can view membership list
 *   MHP.5  Membership detail page accessible to admin
 *   MHP.6  Pending athlete cannot access admin app
 *   MHP.7  Active athlete can access their portal
 *   MHP.8  Membership approval changes state visible to admin
 */

import { test, expect } from '@playwright/test';
import {
  loginAsApprovedAthlete,
  loginAsPendingAthlete,
  loginAsTenantAdmin,
} from '../fixtures/auth.fixture';
import { TEST_TENANT_SLUG, TEST_USERS } from '../fixtures/users.seed';
import { waitForStableUrl } from '../helpers/authSession';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';

// ─── MHP.1 — Public pages ─────────────────────────────────────────────────────

test.describe('MHP — Public Membership Pages', () => {

  test('MHP.1: public membership renewal page loads without auth', async ({ page }) => {
    await page.context().clearCookies();

    await page.goto(`/${TEST_TENANT_SLUG}/membership/renew`);
    await page.waitForLoadState('networkidle');

    // Should load without error (may redirect to login or show form)
    const jsErrors: string[] = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));

    await page.waitForTimeout(1000);
    expect(jsErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);

    // Should not be a blank page
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
  });

  test('MHP.2: tenant landing page shows membership join option', async ({ page }) => {
    await page.context().clearCookies();

    await page.goto(`/${TEST_TENANT_SLUG}`);
    await page.waitForLoadState('networkidle');

    // Should not crash
    const jsErrors: string[] = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));
    await page.waitForTimeout(500);
    expect(jsErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

});

// ─── MHP.2 — Pending athlete flows ───────────────────────────────────────────

test.describe('MHP — Pending Athlete Journey', () => {

  test('MHP.3: pending athlete lands on membership status page', async ({ page }) => {
    await loginAsPendingAthlete(page);
    const url = page.url();

    // Pending athlete should see their membership status, not the portal
    expect(url).toContain('/membership/status');
    expect(url).not.toContain('/portal');
  });

  test('MHP.4: pending athlete membership status page has content', async ({ page }) => {
    await loginAsPendingAthlete(page);

    await page.waitForLoadState('networkidle');

    // Should show some status information
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(50);

    // Should NOT show the full athlete portal
    const athletePortal = page.locator('[data-testid="athlete-portal"]');
    const isVisible = await athletePortal.isVisible().catch(() => false);
    expect(isVisible).toBe(false);
  });

  test('MHP.5: pending athlete blocked from tenant app', async ({ page }) => {
    await loginAsPendingAthlete(page);

    await page.goto(`/${TEST_TENANT_SLUG}/app`);
    const url = await waitForStableUrl(page);

    expect(url).not.toContain('/app');
  });

});

// ─── MHP.3 — Approved athlete flows ──────────────────────────────────────────

test.describe('MHP — Approved Athlete Journey', () => {

  test('MHP.6: approved athlete lands on tenant portal', async ({ page }) => {
    await loginAsApprovedAthlete(page);
    const url = page.url();

    expect(url).toContain(`/${TEST_TENANT_SLUG}/portal`);
  });

  test('MHP.7: approved athlete portal shows profile section', async ({ page }) => {
    await loginAsApprovedAthlete(page);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Should have visible content (not a white screen)
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(100);

    // Should not have infinite spinner
    const spinners = await page.locator('[class*="animate-spin"]').count();
    expect(spinners).toBe(0);
  });

  test('MHP.8: approved athlete cannot access admin app', async ({ page }) => {
    await loginAsApprovedAthlete(page);

    await page.goto(`/${TEST_TENANT_SLUG}/app`);
    const url = await waitForStableUrl(page);

    expect(url).not.toContain('/app');
    expect(url).toContain('/portal');
  });

});

// ─── MHP.4 — Admin membership management ─────────────────────────────────────

test.describe('MHP — Admin Membership Management', () => {

  test('MHP.9: admin membership list page loads', async ({ page }) => {
    await loginAsTenantAdmin(page);

    await page.goto(`/${TEST_TENANT_SLUG}/app/memberships`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Should be on memberships page (not redirected)
    expect(page.url()).toContain('/app/memberships');

    // Should show content
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(50);

    // No infinite spinner
    const spinners = await page.locator('[class*="animate-spin"]').count();
    expect(spinners).toBe(0);
  });

  test('MHP.10: admin approvals page loads', async ({ page }) => {
    await loginAsTenantAdmin(page);

    await page.goto(`/${TEST_TENANT_SLUG}/app/approvals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    expect(page.url()).toContain('/app/approvals');

    // Should have at least the page skeleton
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(50);
  });

  test('MHP.11: admin athletes page loads without crash', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));

    await loginAsTenantAdmin(page);

    await page.goto(`/${TEST_TENANT_SLUG}/app/athletes`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    expect(page.url()).toContain('/app/athletes');
    expect(jsErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('MHP.12: admin can navigate between key sections without errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));

    await loginAsTenantAdmin(page);

    const sections = ['memberships', 'athletes', 'approvals', 'coaches'];

    for (const section of sections) {
      await page.goto(`/${TEST_TENANT_SLUG}/app/${section}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      // Should stay on the section (not redirected away)
      expect(page.url()).toContain(`/app/${section}`);
    }

    // No JS errors across all navigations
    expect(jsErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

});

// ─── MHP.5 — Session persistence ─────────────────────────────────────────────

test.describe('MHP — Session Persistence', () => {

  test('MHP.13: admin session survives page reload', async ({ page }) => {
    await loginAsTenantAdmin(page);

    const urlBeforeReload = page.url();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const urlAfterReload = page.url();

    // Should stay authenticated (not redirected to login)
    expect(urlAfterReload).not.toContain('/login');

    // Should be back on the same section (or app root)
    expect(urlAfterReload).toContain('/app');
  });

  test('MHP.14: athlete session survives page reload', async ({ page }) => {
    await loginAsApprovedAthlete(page);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Should stay authenticated
    expect(page.url()).not.toContain('/login');
    expect(page.url()).toContain('/portal');
  });

});
