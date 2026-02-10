/**
 * C1 SAFE GOLD — UX Persona Resolution
 * 
 * Resolves the current UX persona based on route pathname.
 * This is purely a UX concern — it does NOT affect authorization,
 * RLS, gates, or any security decision.
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
 * Resolve persona from pathname.
 * 
 * Rules (CANONICAL):
 * - /admin/* → ADMIN (global superadmin / system governance)
 * - Everything else → ATHLETE (journey context, safe default)
 * 
 * Persona does NOT depend on role, badge, feature access, or impersonation.
 */
export function resolveUXPersona(pathname: string): UXPersona {
  if (pathname.startsWith('/admin')) return 'ADMIN';
  return 'ATHLETE';
}
