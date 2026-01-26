/**
 * P4A — Athlete Route Access Decision Function
 * PURE FUNCTION: No side effects, no external dependencies
 *
 * IMMUTABLE RULES (ORDER MATTERS):
 * 1. No tenantSlug → '/'
 * 2. /app route → /${tenantSlug}/portal (BLOCK)
 * 3. Tenant doesn't exist → '/'
 * 4. Auth required but not authenticated → /${tenantSlug}/login
 * 5. Otherwise → OK
 */

export interface AthleteRouteDecisionInput {
  tenantSlug: string | null;
  pathname: string;
  isAuthenticated: boolean;
  tenantExists: boolean;
}

export type AthleteRouteDecisionReason =
  | 'NO_TENANT'
  | 'BLOCK_APP'
  | 'TENANT_NOT_FOUND'
  | 'AUTH_REQUIRED'
  | 'OK';

export interface AthleteRouteDecision {
  allow: boolean;
  redirectTo: string | null;
  reason: AthleteRouteDecisionReason;
}

export function resolveAthleteRouteAccess(
  input: AthleteRouteDecisionInput
): AthleteRouteDecision {
  const { tenantSlug, pathname, isAuthenticated, tenantExists } = input;

  // Rule 1 — No tenant slug
  if (!tenantSlug) {
    return { allow: false, redirectTo: '/', reason: 'NO_TENANT' };
  }

  const base = `/${tenantSlug}`;
  const portal = `${base}/portal`;

  // Rule 2 — BLOCK /app (STRICT path matching)
  const isAppRoute =
    pathname === `${base}/app` || pathname.startsWith(`${base}/app/`);

  if (isAppRoute) {
    return { allow: false, redirectTo: portal, reason: 'BLOCK_APP' };
  }

  // Rule 3 — Tenant does not exist
  if (!tenantExists) {
    return { allow: false, redirectTo: '/', reason: 'TENANT_NOT_FOUND' };
  }

  // Routes that REQUIRE auth
  const requiresAuth =
    pathname === portal ||
    pathname.startsWith(`${portal}/`) ||
    pathname.startsWith(`${base}/membership/renew`) ||
    pathname.startsWith(`${base}/membership/status`);

  // Rule 4 — Auth required but not authenticated
  if (requiresAuth && !isAuthenticated) {
    return {
      allow: false,
      redirectTo: `${base}/login`,
      reason: 'AUTH_REQUIRED',
    };
  }

  // Rule 5 — Allow
  return { allow: true, redirectTo: null, reason: 'OK' };
}
