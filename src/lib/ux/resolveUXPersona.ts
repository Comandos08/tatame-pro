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
 * Rules:
 * - /:tenantSlug/app/* → ADMIN (tenant administration)
 * - /:tenantSlug/app/me → ATHLETE (personal trajectory within admin shell)
 * - /:tenantSlug/portal/* → ATHLETE
 * - /admin/* → ADMIN (global superadmin)
 * - Everything else → ATHLETE (safe default)
 */
export function resolveUXPersona(pathname: string): UXPersona {
  // /app/me is the athlete's personal area within the admin shell
  if (/\/app\/me\b/.test(pathname)) return 'ATHLETE';
  
  // /app/* routes are admin context
  if (/\/app(\/|$)/.test(pathname)) return 'ADMIN';
  
  // /admin/* is global superadmin
  if (pathname.startsWith('/admin')) return 'ADMIN';
  
  // /portal/* is athlete context
  if (/\/portal(\/|$)/.test(pathname)) return 'ATHLETE';
  
  // Default: athlete (safe — shows less sensitive info)
  return 'ATHLETE';
}
