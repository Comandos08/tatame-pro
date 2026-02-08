/**
 * 📊 P4.3.D — Structured Test Logging
 * 
 * Prefixes: [E2E], [RESILIENCE], [CONTRACT]
 * Provides consistent logging across test suites.
 */

export type TestCategory = 'E2E' | 'RESILIENCE' | 'CONTRACT';

export function logTestStep(category: TestCategory, message: string): void {
  console.log(`[${category}] ${message}`);
}

export function logTestError(category: TestCategory, error: Error): void {
  console.error(`[${category}] ERROR: ${error.message}`);
  if (error.stack) {
    console.error(`[${category}] Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
  }
}

export function logTestAssertion(category: TestCategory, assertion: string, passed: boolean): void {
  const status = passed ? '✅' : '❌';
  console.log(`[${category}] ${status} ${assertion}`);
}

export function logTestStart(category: TestCategory, testName: string): void {
  console.log(`\n[${category}] ▶️ Starting: ${testName}`);
}

export function logTestEnd(category: TestCategory, testName: string, durationMs: number): void {
  console.log(`[${category}] ⏱️ Completed: ${testName} (${durationMs}ms)`);
}
