/**
 * PI-A08.H1 — PII Contract (Edge Single Source of Truth)
 *
 * SAFE GOLD — This file is the canonical PII contract for all Edge Functions.
 * Mirrors src/domain/security/piiContract.ts but lives in Edge context
 * to avoid cross-boundary imports.
 *
 * Rules:
 * - Explicit lists only — nothing dynamic, nothing inferred
 * - Keep in sync with src/domain/security/piiContract.ts
 * - Any table NOT in PUBLIC_SAFE_TABLES is denied by the sanitizer
 */

// ============================================================================
// SENSITIVE COLUMNS — Columns stripped from public responses
// ============================================================================

export const SENSITIVE_COLUMNS: Record<string, readonly string[]> = {
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

// ============================================================================
// SENSITIVE TABLES — Derived from SENSITIVE_COLUMNS keys + extras
// ============================================================================

const _SENSITIVE_COLUMNS_TABLES = Object.keys(SENSITIVE_COLUMNS);

const _EXTRA_SENSITIVE_TABLES = [
  'user_roles',
  'guardian_links',
  'audit_logs',
  'decision_logs',
  'security_events',
  'documents',
  'password_resets',
  'superadmin_impersonations',
  'webhook_events',
];

export const SENSITIVE_TABLES: readonly string[] = [
  ..._SENSITIVE_COLUMNS_TABLES,
  ..._EXTRA_SENSITIVE_TABLES,
];

// ============================================================================
// PUBLIC SAFE TABLES — Explicitly allowed for public/anon access
// ============================================================================

export const PUBLIC_SAFE_TABLES: readonly string[] = [
  'platform_landing_config',
  'platform_partners',
  'billing_environment_config',
  'feature_access',
];

// ============================================================================
// INSTITUTIONAL LIMITS
// ============================================================================

export const PUBLIC_QUERY_MAX_LIMIT = 50;
