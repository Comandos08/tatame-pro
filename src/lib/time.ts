/**
 * Deterministic time utilities.
 * SAFE GOLD: no new Date() usage allowed outside this file.
 *
 * All time parsing is centralized here to ensure:
 * - Determinism (reproducible results)
 * - Auditability (single point of time conversion)
 * - Zero side effects during render
 */

/**
 * Convert an ISO timestamp string to epoch milliseconds.
 * @param iso - ISO 8601 formatted timestamp string
 * @returns Epoch time in milliseconds
 */
export function toEpoch(iso: string): number {
  return Date.parse(iso);
}

/**
 * Compare two ISO timestamps.
 * @param a - First ISO timestamp
 * @param b - Second ISO timestamp
 * @returns Negative if a < b, positive if a > b, 0 if equal
 */
export function compareTimestamps(a: string, b: string): number {
  return toEpoch(a) - toEpoch(b);
}

/**
 * Check if timestamp a is before timestamp b.
 * @param a - First ISO timestamp
 * @param b - Second ISO timestamp
 * @returns true if a is before b
 */
export function isBefore(a: string, b: string): boolean {
  return toEpoch(a) < toEpoch(b);
}

/**
 * Check if timestamp a is after timestamp b.
 * @param a - First ISO timestamp
 * @param b - Second ISO timestamp
 * @returns true if a is after b
 */
export function isAfter(a: string, b: string): boolean {
  return toEpoch(a) > toEpoch(b);
}
