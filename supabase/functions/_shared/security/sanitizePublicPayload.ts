/**
 * PI-A08.H1 — Public Payload Sanitizer (SAFE GOLD — FAIL-CLOSED)
 *
 * Strips sensitive columns from payloads before returning to public endpoints.
 *
 * FAIL-CLOSED RULES:
 * - If table ∉ PUBLIC_SAFE_TABLES → throw PII_CONTRACT_VIOLATION
 * - If table ∈ SENSITIVE_TABLES and no columns mapped → throw PII_CONTRACT_MISSING_COLUMNS
 * - Sanitization always returns new object — never mutates original
 */

import {
  SENSITIVE_COLUMNS,
  SENSITIVE_TABLES,
  PUBLIC_SAFE_TABLES,
} from './piiContract.ts';

type AnyRecord = Record<string, unknown>;

/**
 * Sanitize a single payload for public consumption.
 * Throws if the table is not explicitly public-safe.
 */
export function sanitizePublicPayload<T extends AnyRecord>(
  table: string,
  payload: T,
): T {
  const isPublicSafe = PUBLIC_SAFE_TABLES.includes(table);
  if (!isPublicSafe) {
    throw new Error(`PII_CONTRACT_VIOLATION:${table}`);
  }

  const isSensitive = SENSITIVE_TABLES.includes(table);
  const cols = SENSITIVE_COLUMNS[table];

  if (isSensitive && (!cols || cols.length === 0)) {
    throw new Error(`PII_CONTRACT_MISSING_COLUMNS:${table}`);
  }

  if (!cols || cols.length === 0) {
    return { ...payload }; // public-safe table with no strips needed
  }

  const sanitized: AnyRecord = { ...payload };
  for (const col of cols) {
    if (col in sanitized) {
      delete sanitized[col];
    }
  }
  return sanitized as T;
}

/**
 * Batch sanitize an array of records.
 */
export function sanitizePublicPayloadArray<T extends AnyRecord>(
  table: string,
  payloads: T[],
): T[] {
  return payloads.map((p) => sanitizePublicPayload(table, p));
}

/**
 * Check if a table is classified as sensitive.
 */
export function isSensitiveTable(table: string): boolean {
  return SENSITIVE_TABLES.includes(table);
}
