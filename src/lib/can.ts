/**
 * 🔐 can.ts — UI Permission Helpers
 * 
 * Helper functions for hiding/showing UI elements based on roles.
 * Uses the centralized access matrix.
 * 
 * IMPORTANT: This is for UX only! Backend/guards still enforce security.
 * Never rely solely on UI hiding for security.
 */

import { AppRole } from '@/types/auth';
import { FeatureKey, ACCESS_MATRIX, hasAnyAllowedRole } from '@/lib/accessMatrix';

/**
 * Check if any of the user's roles can access a feature.
 * 
 * @param userRoles - Array of roles the user has
 * @param feature - Feature key to check
 * @returns boolean - true if user can access
 */
export function canAccess(userRoles: AppRole[], feature: FeatureKey): boolean {
  if (!userRoles || userRoles.length === 0) {
    return false; // Deny by default
  }
  return hasAnyAllowedRole(userRoles, feature);
}

/**
 * Check if user can access multiple features.
 * Returns true if user can access ANY of the features.
 * 
 * @param userRoles - Array of roles the user has
 * @param features - Array of feature keys to check
 * @returns boolean
 */
export function canAccessAny(userRoles: AppRole[], features: FeatureKey[]): boolean {
  return features.some(feature => canAccess(userRoles, feature));
}

/**
 * Check if user can access ALL of the specified features.
 * 
 * @param userRoles - Array of roles the user has
 * @param features - Array of feature keys to check
 * @returns boolean
 */
export function canAccessAll(userRoles: AppRole[], features: FeatureKey[]): boolean {
  return features.every(feature => canAccess(userRoles, feature));
}

/**
 * Get all features a user can access.
 * Useful for building navigation.
 * 
 * @param userRoles - Array of roles the user has
 * @returns FeatureKey[] - Array of accessible features
 */
export function getAccessibleFeatures(userRoles: AppRole[]): FeatureKey[] {
  if (!userRoles || userRoles.length === 0) {
    return [];
  }

  return (Object.keys(ACCESS_MATRIX) as FeatureKey[]).filter(
    feature => canAccess(userRoles, feature)
  );
}

/**
 * Check if a specific role can access a feature.
 * Useful for role-based UI decisions.
 * 
 * @param role - Single role to check
 * @param feature - Feature key to check
 * @returns boolean
 */
export function roleCanAccess(role: AppRole, feature: FeatureKey): boolean {
  const allowedRoles = ACCESS_MATRIX[feature] || [];
  return allowedRoles.includes(role);
}

/**
 * Permission context for a user.
 * Contains all permission-related info for UI decisions.
 */
export interface PermissionContext {
  /** User's roles in the current tenant */
  roles: AppRole[];
  /** Whether user is a global superadmin */
  isGlobalSuperadmin: boolean;
  /** Check if user can access a feature */
  can: (feature: FeatureKey) => boolean;
  /** Check if user can access any of the features */
  canAny: (features: FeatureKey[]) => boolean;
  /** Check if user can access all of the features */
  canAll: (features: FeatureKey[]) => boolean;
}

/**
 * Create a permission context for a user.
 * Useful for passing to child components.
 * 
 * @param roles - User's roles in current tenant
 * @param isGlobalSuperadmin - Whether user is global superadmin
 * @returns PermissionContext
 */
export function createPermissionContext(
  roles: AppRole[],
  isGlobalSuperadmin: boolean = false
): PermissionContext {
  return {
    roles,
    isGlobalSuperadmin,
    can: (feature: FeatureKey) => {
      // Superadmin can access everything
      if (isGlobalSuperadmin) return true;
      return canAccess(roles, feature);
    },
    canAny: (features: FeatureKey[]) => {
      if (isGlobalSuperadmin) return true;
      return canAccessAny(roles, features);
    },
    canAll: (features: FeatureKey[]) => {
      if (isGlobalSuperadmin) return true;
      return canAccessAll(roles, features);
    },
  };
}

/**
 * Pre-defined permission checks for common actions.
 * Use these for consistent permission naming across the app.
 */
export const Permissions = {
  /** Can manage (CRUD) athletes */
  manageAthletes: (roles: AppRole[]) => canAccess(roles, 'TENANT_ATHLETES'),
  
  /** Can manage academies */
  manageAcademies: (roles: AppRole[]) => canAccess(roles, 'TENANT_ACADEMIES'),
  
  /** Can manage coaches */
  manageCoaches: (roles: AppRole[]) => canAccess(roles, 'TENANT_COACHES'),
  
  /** Can approve memberships */
  approveMembers: (roles: AppRole[]) => canAccess(roles, 'TENANT_APPROVALS'),
  
  /** Can view billing */
  viewBilling: (roles: AppRole[]) => canAccess(roles, 'TENANT_BILLING'),
  
  /** Can manage settings */
  manageSettings: (roles: AppRole[]) => canAccess(roles, 'TENANT_SETTINGS'),
  
  /** Can view audit log */
  viewAuditLog: (roles: AppRole[]) => canAccess(roles, 'TENANT_AUDIT_LOG'),
  
  /** Can manage events */
  manageEvents: (roles: AppRole[]) => canAccess(roles, 'TENANT_EVENTS'),
  
  /** Can manage gradings */
  manageGradings: (roles: AppRole[]) => canAccess(roles, 'TENANT_GRADINGS'),
  
  /** Can view rankings */
  viewRankings: (roles: AppRole[]) => canAccess(roles, 'TENANT_RANKINGS'),
  
  /** Can access athlete portal */
  accessPortal: (roles: AppRole[]) => canAccess(roles, 'ATHLETE_PORTAL'),
  
  /** Can access tenant app */
  accessApp: (roles: AppRole[]) => canAccess(roles, 'TENANT_APP'),
} as const;
