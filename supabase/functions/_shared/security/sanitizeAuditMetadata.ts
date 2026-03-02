/**
 * sanitizeAuditMetadata — PII Sanitization for Audit Logs
 *
 * Masks emails and names in metadata JSONB before audit insertion.
 * LGPD compliance: audit logs should not contain raw PII.
 *
 * Usage:
 *   await supabase.from("audit_logs").insert({
 *     ...auditData,
 *     metadata: sanitizeAuditMetadata(rawMetadata),
 *   });
 */

/**
 * Masks an email address: "user@example.com" → "us***@example.com"
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== "string") return "***";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const maskedLocal = local.length <= 2 ? "***" : local.substring(0, 2) + "***";
  return `${maskedLocal}@${domain}`;
}

/**
 * Masks a name: "João Silva Santos" → "João S."
 */
export function maskName(name: string): string {
  if (!name || typeof name !== "string") return "***";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0]?.charAt(0) + "***";
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

/**
 * Known PII keys in audit metadata.
 */
const PII_KEYS = new Set([
  "email", "user_email", "athlete_email", "applicant_email",
  "name", "athlete_name", "user_name", "applicant_name",
  "full_name", "display_name",
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Recursively sanitizes PII in audit metadata.
 * Only processes known PII keys — other fields pass through unchanged.
 */
export function sanitizeAuditMetadata(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") return metadata;

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string" && PII_KEYS.has(key.toLowerCase())) {
      if (EMAIL_PATTERN.test(value)) {
        sanitized[key] = maskEmail(value);
      } else {
        sanitized[key] = maskName(value);
      }
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
