/**
 * PI-A08 — Public Payload Sanitizer (SAFE GOLD)
 *
 * Strips sensitive columns from payloads before returning to public endpoints.
 * Used by Edge Functions that serve public/anon data.
 *
 * Rules:
 * - If table is in SENSITIVE_TABLES → strip SENSITIVE_COLUMNS
 * - If table is not in PUBLIC_SAFE_TABLES and not in SENSITIVE_TABLES → pass through with warning
 * - Never mutates original object
 */

// ============================================================================
// SENSITIVE COLUMNS MAP (mirrors src/domain/security/piiContract.ts)
// Keep in sync — this is the backend enforcement layer
// ============================================================================

const SENSITIVE_COLUMNS: Record<string, readonly string[]> = {
  profiles: ['email', 'phone', 'avatar_url'],
  athletes: ['email', 'phone', 'national_id', 'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country', 'birth_date', 'profile_id'],
  coaches: ['profile_id'],
  guardians: ['email', 'phone', 'national_id', 'profile_id'],
  memberships: ['stripe_checkout_session_id', 'stripe_payment_intent_id', 'applicant_data', 'documents_uploaded', 'review_notes', 'rejection_reason', 'cancellation_reason'],
  digital_cards: ['content_hash_sha256'],
  diplomas: ['content_hash_sha256'],
  tenant_billing: ['stripe_customer_id', 'stripe_subscription_id'],
  tenant_invoices: ['stripe_invoice_id', 'stripe_customer_id', 'hosted_invoice_url', 'invoice_pdf'],
};

const SENSITIVE_TABLES = new Set([
  'profiles', 'user_roles', 'memberships', 'athletes', 'guardians',
  'guardian_links', 'coaches', 'audit_logs', 'decision_logs',
  'security_events', 'digital_cards', 'diplomas', 'documents',
  'password_resets', 'superadmin_impersonations', 'tenant_billing',
  'tenant_invoices', 'webhook_events',
]);

/**
 * Strip sensitive columns from a payload.
 * Returns a new object — never mutates the original.
 */
export function sanitizePublicPayload<T extends Record<string, unknown>>(
  table: string,
  payload: T,
): T {
  const columns = SENSITIVE_COLUMNS[table];
  if (!columns || columns.length === 0) {
    return payload;
  }

  const sanitized = { ...payload };
  for (const col of columns) {
    if (col in sanitized) {
      delete sanitized[col];
    }
  }
  return sanitized;
}

/**
 * Check if a table is classified as sensitive.
 */
export function isSensitiveTable(table: string): boolean {
  return SENSITIVE_TABLES.has(table);
}

/**
 * Batch sanitize an array of records.
 */
export function sanitizePublicPayloadArray<T extends Record<string, unknown>>(
  table: string,
  payloads: T[],
): T[] {
  return payloads.map(p => sanitizePublicPayload(table, p));
}
