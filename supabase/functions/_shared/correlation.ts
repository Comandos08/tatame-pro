/**
 * A02 — Correlation ID Extractor (SAFE GOLD)
 *
 * Extracts `x-correlation-id` from request headers,
 * or generates a new UUID if not present.
 *
 * Deterministic: same header → same ID.
 */

/**
 * Extract or generate a correlation ID for the current request.
 */
export function extractCorrelationId(req: Request): string {
  return req.headers.get("x-correlation-id") || crypto.randomUUID();
}
