/**
 * 🔐 ACCESS MATRIX — Single Source of Truth for Role-Based Access Control
 * 
 * This file defines which roles can access which features/routes.
 * ALL permission checks in the application MUST use this matrix.
 * 
 * RULES:
 * - Deny by default
 * - No heuristics (email, name, etc.)
 * - Only user_roles table is the source
 * - /portal remains the single decision hub
 */

import { AppRole } from '@/types/auth';

/**
 * Feature keys that can be controlled by the access matrix.
 * Each key corresponds to a route pattern or feature area.
 */
export type FeatureKey =
  // Tenant App routes (/{tenantSlug}/app/*)
  | 'TENANT_APP'              // General access to /app
  | 'TENANT_DASHBOARD'        // /{tenantSlug}/app
  | 'TENANT_ATHLETES'         // /{tenantSlug}/app/athletes
  | 'TENANT_MEMBERSHIPS'      // /{tenantSlug}/app/memberships
  | 'TENANT_ACADEMIES'        // /{tenantSlug}/app/academies
  | 'TENANT_COACHES'          // /{tenantSlug}/app/coaches
  | 'TENANT_GRADINGS'         // /{tenantSlug}/app/grading-schemes
  | 'TENANT_APPROVALS'        // /{tenantSlug}/app/approvals (sensitive!)
  | 'TENANT_RANKINGS'         // /{tenantSlug}/app/rankings
  | 'TENANT_EVENTS'           // /{tenantSlug}/app/events
  | 'TENANT_AUDIT_LOG'        // /{tenantSlug}/app/audit-log
  | 'TENANT_SETTINGS'         // /{tenantSlug}/app/settings
  | 'TENANT_BILLING'          // /{tenantSlug}/app/billing (admin only!)
  | 'TENANT_MY_AREA'          // /{tenantSlug}/app/me
  | 'TENANT_HELP'             // /{tenantSlug}/app/help
  // Portal routes (/{tenantSlug}/portal/*)
  | 'ATHLETE_PORTAL'          // /{tenantSlug}/portal
  | 'ATHLETE_PORTAL_EVENTS'   // /{tenantSlug}/portal/events
  | 'ATHLETE_PORTAL_CARD'     // /{tenantSlug}/portal/card
  // Global admin routes (/admin/*)
  | 'GLOBAL_ADMIN';           // /admin/*

/**
 * The access matrix defining which roles can access which features.
 * 
 * IMPORTANT: 
 * - SUPERADMIN_GLOBAL is handled separately (bypasses all tenant checks)
 * - Roles here are tenant-scoped
 */
export const ACCESS_MATRIX: Record<FeatureKey, AppRole[]> = {
  // === TENANT APP ROUTES ===
  // General app access - staff and management roles
  TENANT_APP: [
    'ADMIN_TENANT',
    'STAFF_ORGANIZACAO',
    'COACH_PRINCIPAL',
    'COACH_ASSISTENTE',
    'INSTRUTOR',
    'RECEPCAO',
  ],

  TENANT_DASHBOARD: [
    'ADMIN_TENANT',
    'STAFF_ORGANIZACAO',
    'COACH_PRINCIPAL',
    'COACH_ASSISTENTE',
    'INSTRUTOR',
    'RECEPCAO',
  ],

  TENANT_ATHLETES: [
    'ADMIN_TENANT',
    'STAFF_ORGANIZACAO',
    'COACH_PRINCIPAL',
    'COACH_ASSISTENTE',
    'INSTRUTOR',
  ],

  TENANT_MEMBERSHIPS: [
    'ADMIN_TENANT',
    'STAFF_ORGANIZACAO',
    'COACH_PRINCIPAL',
  ],

  TENANT_ACADEMIES: [
    'ADMIN_TENANT',
    'STAFF_ORGANIZACAO',
  ],

  TENANT_COACHES: [
    'ADMIN_TENANT',
    'STAFF_ORGANIZACAO',
  ],

  TENANT_GRADINGS: [
    'ADMIN_TENANT',
    'STAFF_ORGANIZACAO',
    'COACH_PRINCIPAL',
    'INSTRUTOR',
  ],

  // 🔐 SENSITIVE: Approval flow - only admin and staff
  TENANT_APPROVALS: [
    'ADMIN_TENANT',
    'STAFF_ORGANIZACAO',
    'COACH_PRINCIPAL', // Can approve for their academy
  ],

  TENANT_RANKINGS: [
    'ADMIN_TENANT',
    'STAFF_ORGANIZACAO',
    'COACH_PRINCIPAL',
    'COACH_ASSISTENTE',
    'INSTRUTOR',
  ],

  TENANT_EVENTS: [
    'ADMIN_TENANT',
    'STAFF_ORGANIZACAO',
    'COACH_PRINCIPAL',
  ],

  TENANT_AUDIT_LOG: [
    'ADMIN_TENANT',
    'STAFF_ORGANIZACAO',
  ],

  TENANT_SETTINGS: [
    'ADMIN_TENANT',
    'STAFF_ORGANIZACAO',
  ],

  // 🔐 HIGHLY SENSITIVE: Billing - only admin
  TENANT_BILLING: [
    'ADMIN_TENANT',
    'STAFF_ORGANIZACAO',
  ],

  TENANT_MY_AREA: [
    'ADMIN_TENANT',
    'STAFF_ORGANIZACAO',
    'COACH_PRINCIPAL',
    'COACH_ASSISTENTE',
    'INSTRUTOR',
    'RECEPCAO',
    'ATLETA',
  ],

  TENANT_HELP: [
    'ADMIN_TENANT',
    'STAFF_ORGANIZACAO',
    'COACH_PRINCIPAL',
    'COACH_ASSISTENTE',
    'INSTRUTOR',
    'RECEPCAO',
    'ATLETA',
  ],

  // === ATHLETE PORTAL ROUTES ===
  // Any authenticated member with a role in the tenant
  ATHLETE_PORTAL: [
    'ATLETA',
    'COACH_PRINCIPAL',
    'COACH_ASSISTENTE',
    'INSTRUTOR',
    'STAFF_ORGANIZACAO',
    'ADMIN_TENANT',
    'RECEPCAO',
  ],

  ATHLETE_PORTAL_EVENTS: [
    'ATLETA',
    'COACH_PRINCIPAL',
    'COACH_ASSISTENTE',
    'INSTRUTOR',
    'STAFF_ORGANIZACAO',
    'ADMIN_TENANT',
  ],

  ATHLETE_PORTAL_CARD: [
    'ATLETA',
    'COACH_PRINCIPAL',
    'COACH_ASSISTENTE',
    'INSTRUTOR',
    'STAFF_ORGANIZACAO',
    'ADMIN_TENANT',
  ],

  // === GLOBAL ADMIN ===
  // This is checked differently (isGlobalSuperadmin)
  GLOBAL_ADMIN: ['SUPERADMIN_GLOBAL'],
};

/**
 * Route-to-feature mapping for automatic protection.
 * Used by RequireRoles guard to determine required roles.
 */
export const ROUTE_FEATURE_MAP: Record<string, FeatureKey> = {
  // Tenant App routes
  'app': 'TENANT_APP',
  'app/': 'TENANT_DASHBOARD',
  'app/athletes': 'TENANT_ATHLETES',
  'app/memberships': 'TENANT_MEMBERSHIPS',
  'app/academies': 'TENANT_ACADEMIES',
  'app/coaches': 'TENANT_COACHES',
  'app/grading-schemes': 'TENANT_GRADINGS',
  'app/approvals': 'TENANT_APPROVALS',
  'app/rankings': 'TENANT_RANKINGS',
  'app/events': 'TENANT_EVENTS',
  'app/audit-log': 'TENANT_AUDIT_LOG',
  'app/settings': 'TENANT_SETTINGS',
  'app/billing': 'TENANT_BILLING',
  'app/me': 'TENANT_MY_AREA',
  'app/help': 'TENANT_HELP',
  // Portal routes
  'portal': 'ATHLETE_PORTAL',
  'portal/events': 'ATHLETE_PORTAL_EVENTS',
  'portal/card': 'ATHLETE_PORTAL_CARD',
};

/**
 * Get the allowed roles for a specific feature.
 * Returns empty array if feature not found (deny by default).
 */
export function getAllowedRoles(feature: FeatureKey): AppRole[] {
  return ACCESS_MATRIX[feature] || [];
}

/**
 * Check if a role is allowed to access a feature.
 */
export function isRoleAllowed(role: AppRole, feature: FeatureKey): boolean {
  const allowedRoles = getAllowedRoles(feature);
  return allowedRoles.includes(role);
}

/**
 * Check if any of the given roles can access a feature.
 */
export function hasAnyAllowedRole(roles: AppRole[], feature: FeatureKey): boolean {
  const allowedRoles = getAllowedRoles(feature);
  return roles.some(role => allowedRoles.includes(role));
}

/**
 * Get feature key from route path (relative to tenant).
 * Returns null if no matching feature found.
 */
export function getFeatureFromRoute(routePath: string): FeatureKey | null {
  // Normalize path
  const normalizedPath = routePath.replace(/^\//, '').replace(/\/$/, '');
  
  // Try exact match first
  if (normalizedPath in ROUTE_FEATURE_MAP) {
    return ROUTE_FEATURE_MAP[normalizedPath];
  }
  
  // Try prefix match (for nested routes like app/athletes/:id)
  for (const [route, feature] of Object.entries(ROUTE_FEATURE_MAP)) {
    if (normalizedPath.startsWith(route)) {
      return feature;
    }
  }
  
  return null;
}
