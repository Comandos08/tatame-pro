/**
 * 🔗 Correlation ID — Session-scoped unique identifier
 * 
 * Generated once per page load. Propagated in all structured logs.
 * Format: "fe-{random}" to distinguish frontend from backend correlation IDs.
 */

let sessionCorrelationId: string | null = null;

function generateCorrelationId(): string {
  const random = Math.random().toString(36).substring(2, 10);
  const timestamp = Date.now().toString(36);
  return `fe-${timestamp}-${random}`;
}

/**
 * Get or create the session correlation ID.
 * Created lazily on first call, persists for entire page lifecycle.
 */
export function getCorrelationId(): string {
  if (!sessionCorrelationId) {
    sessionCorrelationId = generateCorrelationId();
  }
  return sessionCorrelationId;
}

/**
 * Reset correlation ID (for testing only).
 */
export function resetCorrelationId(): void {
  sessionCorrelationId = null;
}
