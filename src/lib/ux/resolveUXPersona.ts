/**
 * C1 SAFE GOLD — UX Persona Resolution (SSoT: IdentityContext.role)
 * 
 * PI-ACTIVE-CONTEXT-SSOT-001: Persona is derived exclusively from the
 * resolved identity role — never from pathname or route.
 * 
 * Persona determines:
 * - Copy/titles shown
 * - Context label in header
 * - Which information is emphasized
 * 
 * Persona does NOT determine:
 * - Access (A3 sovereign)
 * - Permissions (feature_access sovereign)
 * - Billing gates (B2 sovereign)
 */

export type UXPersona = 'ADMIN' | 'ATHLETE';

/**
 * Resolve persona from identity role (SSoT).
 * 
 * Rules (CANONICAL):
 * - SUPERADMIN_GLOBAL → ADMIN
 * - ADMIN_TENANT      → ADMIN
 * - ATHLETE           → ATHLETE
 * - null (loading/unknown) → ATHLETE (safe default)
 * 
 * STAFF_ORGANIZACAO is NOT listed because the Identity Engine
 * normalizes it to ADMIN_TENANT before it reaches the frontend.
 */
export function resolveUXPersona(role: string | null): UXPersona {
  if (role === 'SUPERADMIN_GLOBAL' || role === 'ADMIN_TENANT') return 'ADMIN';
  return 'ATHLETE';
}
