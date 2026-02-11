/**
 * PI-A08 — PII Contract Definitivo (SAFE GOLD)
 *
 * Formal separation of public vs private data.
 * Explicit lists — nothing dynamic, nothing inferred.
 *
 * This contract governs:
 * - Which tables contain sensitive PII
 * - Which columns within those tables are sensitive
 * - Which tables are safe for public/anon access
 * - TypeScript types for public vs private views
 */

// ============================================================================
// SENSITIVE TABLES — Tables that MUST NOT be accessible via anon
// ============================================================================

export const SENSITIVE_TABLES = [
  'profiles',
  'user_roles',
  'memberships',
  'athletes',
  'guardians',
  'guardian_links',
  'coaches',
  'audit_logs',
  'decision_logs',
  'security_events',
  'digital_cards',
  'diplomas',
  'documents',
  'password_resets',
  'superadmin_impersonations',
  'tenant_billing',
  'tenant_invoices',
  'webhook_events',
] as const;

export type SensitiveTable = typeof SENSITIVE_TABLES[number];

// ============================================================================
// SENSITIVE COLUMNS — Columns that MUST be stripped from public responses
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
} as const;

// ============================================================================
// PUBLIC SAFE TABLES — Explicitly allowed for anon/public access
// ============================================================================

export const PUBLIC_SAFE_TABLES = [
  'platform_landing_config',
  'platform_partners',
  'billing_environment_config',
  'feature_access',
] as const;

export type PublicSafeTable = typeof PUBLIC_SAFE_TABLES[number];

// ============================================================================
// PUBLIC vs PRIVATE TypeScript Views
// ============================================================================

/** Public-safe tenant view — no billing or internal flags */
export type PublicTenantView = {
  id: string;
  name: string;
  slug: string;
  sport_types?: string[];
};

/** Private tenant view — includes internal details */
export type PrivateTenantView = PublicTenantView & {
  lifecycle_status: string;
  is_active: boolean;
  billing_email?: string | null;
  stripe_customer_id?: string | null;
};

/** Public-safe athlete view — masked, no PII */
export type PublicAthleteView = {
  id: string;
  maskedName: string;
};

/** Private athlete view — full PII, admin-only */
export type PrivateAthleteView = {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  national_id?: string | null;
  birth_date: string;
  gender: string;
};

/** Public academy view — institutional, no PII */
export type PublicAcademyView = {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  sport_type?: string | null;
};

/** Public diploma verification view — masked */
export type PublicDiplomaView = {
  found: boolean;
  isValid: boolean;
  validityReason?: string | null;
  athleteName: string; // masked
  status: string;
  levelName?: string | null;
  levelCode?: string | null;
  schemeName?: string | null;
  sportType?: string | null;
  promotionDate: string;
  serialNumber: string;
  tenantName: string;
  academyName?: string | null;
  coachName?: string | null; // masked
};

/** Public digital card verification view — masked */
export type PublicDigitalCardView = {
  found: boolean;
  isValid: boolean;
  validityReason?: string | null;
  athleteName: string; // masked
  membershipStatus: string;
  cardStatus: string;
  validUntil?: string | null;
  issuedAt?: string | null;
  tenantName: string;
  sportType?: string;
  gradingLevel?: string | null;
  gradingScheme?: string | null;
  academyName?: string | null;
  coachName?: string | null; // masked
};

// ============================================================================
// PII CLASSIFICATION for audit
// ============================================================================

export type PiiExposureRisk = 'CRITICAL' | 'HIGH' | 'SAFE';

export interface PiiExposureFinding {
  table: string;
  policy: string;
  cmd: string;
  risk: PiiExposureRisk;
  reason: string;
}

/**
 * Classify anon access policy against PII contract.
 */
export function classifyAnonAccess(
  tablename: string,
  cmd: string,
  policyname: string,
): PiiExposureFinding {
  const isSensitive = (SENSITIVE_TABLES as readonly string[]).includes(tablename);
  const isPublicSafe = (PUBLIC_SAFE_TABLES as readonly string[]).includes(tablename);
  const isWrite = cmd === 'INSERT' || cmd === 'UPDATE' || cmd === 'DELETE' || cmd === 'ALL';

  // CRITICAL: anon write on any table
  if (isWrite) {
    return {
      table: tablename,
      policy: policyname,
      cmd,
      risk: 'CRITICAL',
      reason: `Anonymous ${cmd} access — potential data mutation by unauthenticated users`,
    };
  }

  // CRITICAL: anon SELECT on sensitive table
  if (isSensitive) {
    return {
      table: tablename,
      policy: policyname,
      cmd,
      risk: 'CRITICAL',
      reason: `Anonymous SELECT on sensitive PII table '${tablename}'`,
    };
  }

  // HIGH: anon SELECT on unknown table (not explicitly public-safe)
  if (!isPublicSafe) {
    return {
      table: tablename,
      policy: policyname,
      cmd,
      risk: 'HIGH',
      reason: `Anonymous SELECT on table '${tablename}' not in PUBLIC_SAFE_TABLES`,
    };
  }

  // SAFE: anon SELECT on explicitly public table
  return {
    table: tablename,
    policy: policyname,
    cmd,
    risk: 'SAFE',
    reason: `Anonymous SELECT on explicitly public table`,
  };
}

// ============================================================================
// INSTITUTIONAL LIMITS — Anti-enumeration
// ============================================================================

export const PUBLIC_QUERY_MAX_LIMIT = 50;
