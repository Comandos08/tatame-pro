import { Page } from '@playwright/test';
import { Session } from '@supabase/supabase-js';
import { getSupabaseProjectRef } from '../fixtures/supabaseTestClient';

/**
 * 🔐 Auth Session Helpers
 * 
 * Utilities for injecting and managing Supabase auth sessions in Playwright.
 */

/**
 * Injects Supabase session cookies into the browser
 * 
 * @param page - Playwright page instance
 * @param session - Supabase session with tokens
 */
export async function injectSessionCookies(page: Page, session: Session): Promise<void> {
  const projectRef = getSupabaseProjectRef();
  
  // Get the base URL from page context
  const baseUrl = new URL(page.url() || 'http://localhost:5173');
  const domain = baseUrl.hostname;
  
  // Supabase cookie names follow the pattern: sb-{project-ref}-auth-token
  const cookieName = `sb-${projectRef}-auth-token`;
  
  // Create the auth token cookie value (base64 encoded session)
  const sessionData = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };
  
  const cookieValue = btoa(JSON.stringify(sessionData));
  
  // Set cookies in the browser context
  await page.context().addCookies([
    {
      name: cookieName,
      value: cookieValue,
      domain: domain === 'localhost' ? 'localhost' : `.${domain}`,
      path: '/',
      httpOnly: false,
      secure: domain !== 'localhost',
      sameSite: 'Lax',
    },
  ]);
  
  // Also set in localStorage for Supabase client-side detection
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    {
      key: `sb-${projectRef}-auth-token`,
      value: JSON.stringify(sessionData),
    }
  );
}

/**
 * Clears all Supabase auth cookies and localStorage
 */
export async function clearAuthSession(page: Page): Promise<void> {
  const projectRef = getSupabaseProjectRef();
  const cookieName = `sb-${projectRef}-auth-token`;
  
  // Clear cookies
  await page.context().clearCookies();
  
  // Clear localStorage
  await page.evaluate((key) => {
    localStorage.removeItem(key);
    // Also clear any other Supabase-related items
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const storageKey = localStorage.key(i);
      if (storageKey?.startsWith('sb-')) {
        localStorage.removeItem(storageKey);
      }
    }
  }, cookieName);
}

/**
 * Waits for the URL to stabilize (no more redirects)
 * Returns the final URL
 */
export async function waitForStableUrl(page: Page, timeout = 10000): Promise<string> {
  let lastUrl = page.url();
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    await page.waitForTimeout(300);
    const currentUrl = page.url();
    
    if (currentUrl === lastUrl) {
      // URL stable for 300ms, wait a bit more to confirm
      await page.waitForTimeout(200);
      if (page.url() === currentUrl) {
        return currentUrl;
      }
    }
    lastUrl = currentUrl;
  }
  
  return page.url();
}

/**
 * Detects redirect loops by tracking URL changes
 */
export async function detectRedirectLoop(
  page: Page,
  maxRedirects = 8,
  timeout = 5000
): Promise<{ hasLoop: boolean; history: string[] }> {
  const history: string[] = [page.url()];
  let redirectCount = 0;
  
  const navigationHandler = (frame: any) => {
    if (frame === page.mainFrame()) {
      const url = frame.url();
      history.push(url);
      redirectCount++;
    }
  };
  
  page.on('framenavigated', navigationHandler);
  
  await page.waitForTimeout(timeout);
  
  page.off('framenavigated', navigationHandler);
  
  // Check for loop pattern
  const urlCounts = new Map<string, number>();
  for (const url of history) {
    // Normalize URL for comparison (remove query params for loop detection)
    const normalizedUrl = url.split('?')[0];
    urlCounts.set(normalizedUrl, (urlCounts.get(normalizedUrl) || 0) + 1);
  }
  
  const hasLoop = Array.from(urlCounts.values()).some(count => count >= 3) || redirectCount > maxRedirects;
  
  return { hasLoop, history };
}

/**
 * Validates that the current URL matches the expected destination
 */
export function validateDestination(
  currentUrl: string,
  expected: string | RegExp,
  userRole: string
): void {
  const matches = expected instanceof RegExp 
    ? expected.test(currentUrl)
    : currentUrl.includes(expected);
  
  if (!matches) {
    throw new Error(
      `🔐 Auth fixture validation failed for ${userRole}:\n` +
      `  Expected destination: ${expected}\n` +
      `  Actual URL: ${currentUrl}`
    );
  }
}
