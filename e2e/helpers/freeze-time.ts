/**
 * ⏱️ Time Control — PI E1.0
 *
 * Freezes Date.now() to a deterministic value.
 * Use before page navigation for predictable tests.
 */

import { Page } from '@playwright/test';

/**
 * Freezes time to a specific ISO timestamp.
 * Must be called BEFORE page.goto().
 */
export async function freezeTime(
  page: Page,
  iso: string = '2026-02-07T12:00:00.000Z'
): Promise<void> {
  await page.addInitScript((timestamp) => {
    const frozenNow = new Date(timestamp).getTime();

    // Override Date.now()
    Date.now = () => frozenNow;

    // Override new Date() for current time
    const OriginalDate = Date;
    // @ts-expect-error overriding global Date with a subclass for test determinism
    window.Date = class extends OriginalDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(frozenNow);
        } else {
          // @ts-expect-error spreading Date constructor args is not typed in lib.d.ts
          super(...args);
        }
      }

      static now() {
        return frozenNow;
      }
    };
  }, iso);
}
