/**
 * PI U8 — DETERMINISTIC TIME CONTROL
 *
 * Freeze time for unit tests using vitest fake timers.
 * Must be called in beforeEach/beforeAll.
 *
 * ❌ FORBIDDEN: Date.now() in tests
 * ❌ FORBIDDEN: new Date() without explicit ISO
 * ✅ REQUIRED: freezeTestTime() at start of every test suite
 */

import { vi } from 'vitest';
import { FIXED_TEST_TIME } from './constants';

/**
 * Freeze vitest timers to a deterministic point.
 * Call in beforeEach() or beforeAll().
 */
export function freezeTestTime(iso: string = FIXED_TEST_TIME): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

/**
 * Restore real timers.
 * Call in afterEach() or afterAll().
 */
export function unfreezeTestTime(): void {
  vi.useRealTimers();
}
