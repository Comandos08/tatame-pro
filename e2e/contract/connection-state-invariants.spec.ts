/**
 * 🔒 P4.3.1 — Connection State Invariant Test
 * 
 * CONTRACT (NEVER REMOVE):
 * - Exactly ONE element with [data-conn-state] per page render
 * - Value MUST be one of: 'live' | 'syncing' | 'polling' | 'offline'
 * 
 * This test enforces the P4.3.1 single-element governance rule.
 */

import { test, expect } from '@playwright/test';
import { loginAsSuperAdmin } from '../fixtures/auth.fixture';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

// Canonical valid states (must match src/types/connection-state.ts)
const VALID_CONNECTION_STATES = ['live', 'syncing', 'polling', 'offline'] as const;

test.describe('Connection State Invariants', () => {
  /**
   * INVARIANT I.1: Exactly ONE data-conn-state element per render
   * 
   * This test MUST NEVER BE REMOVED.
   * Violation indicates architecture regression.
   */
  test('I.1: exactly one data-conn-state element exists', async ({ page }) => {
    logTestStep('CONTRACT', 'Validating single data-conn-state invariant');
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Wait for AlertBadge to render
    await page.waitForTimeout(2000);
    
    // Get all elements with data-conn-state
    const stateElements = await page.locator('[data-conn-state]').all();
    
    // INVARIANT: Exactly 1 element
    expect(stateElements.length).toBe(1);
    
    logTestAssertion('CONTRACT', `Found exactly ${stateElements.length} data-conn-state element(s)`, stateElements.length === 1);
  });
  
  /**
   * INVARIANT I.2: data-conn-state value is valid enum member
   * 
   * This test MUST NEVER BE REMOVED.
   * Violation indicates state machine corruption.
   */
  test('I.2: data-conn-state value is valid enum', async ({ page }) => {
    logTestStep('CONTRACT', 'Validating data-conn-state enum membership');
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    
    // Wait for AlertBadge to render
    await page.waitForTimeout(2000);
    
    // Get the element
    const stateElement = page.locator('[data-conn-state]').first();
    
    // Must exist
    await expect(stateElement).toBeVisible({ timeout: 5000 });
    
    // Get value
    const value = await stateElement.getAttribute('data-conn-state');
    
    // INVARIANT: Value must be in enum
    expect(VALID_CONNECTION_STATES).toContain(value);
    
    logTestAssertion('CONTRACT', `Connection state value "${value}" is valid enum member`, VALID_CONNECTION_STATES.includes(value as typeof VALID_CONNECTION_STATES[number]));
  });
  
  /**
   * INVARIANT I.3: State remains singular after panel interaction
   * 
   * Ensures opening AlertsPanel doesn't create duplicate indicators.
   */
  test('I.3: opening AlertsPanel preserves single element', async ({ page }) => {
    logTestStep('CONTRACT', 'Validating panel interaction maintains invariant');
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Initial count
    const initialElements = await page.locator('[data-conn-state]').all();
    expect(initialElements.length).toBe(1);
    
    // Open AlertsPanel
    const alertBadge = page.locator('button:has(svg.lucide-bell)');
    await alertBadge.click();
    await page.waitForTimeout(500);
    
    // Count after panel open
    const afterOpenElements = await page.locator('[data-conn-state]').all();
    
    // INVARIANT: Still exactly 1 (AlertsPanel must NOT have data-conn-state)
    expect(afterOpenElements.length).toBe(1);
    
    logTestAssertion('CONTRACT', 'Single element preserved after panel open', afterOpenElements.length === 1);
    
    // Close panel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    
    // Count after close
    const afterCloseElements = await page.locator('[data-conn-state]').all();
    expect(afterCloseElements.length).toBe(1);
    
    logTestAssertion('CONTRACT', 'Single element preserved after panel close', afterCloseElements.length === 1);
  });
  
  /**
   * INVARIANT I.4: State transitions are valid
   * 
   * When WebSocket is blocked, state should transition to syncing/polling.
   */
  test('I.4: blocked WebSocket transitions to non-live state', async ({ page }) => {
    logTestStep('CONTRACT', 'Validating WebSocket block state transition');
    
    // Block realtime before navigation
    await page.route('**/realtime/**', route => route.abort());
    await page.route('**/realtime-v1/**', route => route.abort());
    
    await loginAsSuperAdmin(page);
    await page.goto('/admin/health');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Get state
    const stateElement = page.locator('[data-conn-state]').first();
    const value = await stateElement.getAttribute('data-conn-state');
    
    // When WebSocket blocked, state MUST NOT be 'live'
    expect(value).not.toBe('live');
    expect(['syncing', 'polling', 'offline']).toContain(value);
    
    logTestAssertion('CONTRACT', `Blocked WebSocket shows state "${value}" (not live)`, value !== 'live');
  });
});
