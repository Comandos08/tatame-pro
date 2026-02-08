/**
 * ============================================================================
 * 🔐 ACCESS RESOLVER — Type Definitions
 * ============================================================================
 * 
 * SAFE GOLD CONTRACT:
 * - No null
 * - No undefined
 * - No boolean
 * - Always one of the explicit states
 * 
 * This module defines the canonical types for access resolution.
 * All guards consume these types — none define their own.
 * ============================================================================
 */

import { AppRole } from '@/types/auth';

/**
 * Explicit denial reasons — each maps to a specific recovery action
 */
export type AccessDeniedReason =
  | 'NOT_AUTHENTICATED'     // No valid session
  | 'TENANT_REQUIRED'       // Route requires tenant, none found
  | 'TENANT_NOT_FOUND'      // Tenant slug doesn't exist
  | 'TENANT_BLOCKED'        // Tenant is inactive (suspended/deleted)
  | 'ROLE_DENIED'           // User lacks required role
  | 'BILLING_BLOCKED'       // Billing prevents access
  | 'WIZARD_REQUIRED'       // User hasn't completed setup
  | 'IMPERSONATION_REQUIRED' // Superadmin needs to impersonate
  | 'ONBOARDING_REQUIRED'   // Tenant hasn't completed onboarding
  | 'TIMEOUT'               // Resolution timed out
  | 'UNKNOWN_ERROR';        // Catch-all for unexpected failures

/**
 * Access resolution result — deterministic state machine output
 */
export type AccessResult =
  | { state: 'ALLOWED' }
  | { state: 'LOADING' }
  | { state: 'DENIED'; reason: AccessDeniedReason; redirectTo?: string }
  | { state: 'ERROR'; error: string; reason: AccessDeniedReason };

/**
 * Context required for access resolution
 */
export interface AccessContext {
  /** Current route pathname */
  pathname: string;
  /** Whether route requires authentication */
  requiresAuth: boolean;
  /** Whether route requires tenant context */
  requiresTenant: boolean;
  /** Required roles (if any) */
  requiredRoles?: AppRole[];
  /** Whether route is billing-protected */
  requiresBilling: boolean;
  /** Whether route requires completed onboarding */
  requiresOnboarding: boolean;
}

/**
 * Input data for access resolution
 */
export interface AccessResolutionInput {
  // Auth state
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  sessionUserId: string | null;
  
  // Identity state
  identityState: 'loading' | 'wizard_required' | 'resolved' | 'superadmin' | 'error';
  identityError: { code: string; message: string } | null;
  wizardCompleted: boolean;
  
  // Tenant state
  tenantId: string | null;
  tenantSlug: string | null;
  tenantIsActive: boolean;
  tenantIsLoading: boolean;
  tenantError: string | null;
  tenantStatus: 'SETUP' | 'ACTIVE' | 'SUSPENDED' | null;
  
  // Roles
  userRoles: AppRole[];
  rolesLoading: boolean;
  
  // Billing
  billingStatus: string | null;
  billingIsBlocked: boolean;
  billingIsReadOnly: boolean;
  
  // Impersonation (for superadmin)
  isGlobalSuperadmin: boolean;
  isImpersonating: boolean;
  impersonatedTenantId: string | null;
  impersonationResolutionStatus: 'IDLE' | 'RESOLVING' | 'RESOLVED';
}

/**
 * Resolution timeout configuration
 */
export const ACCESS_RESOLUTION_TIMEOUT_MS = 10_000; // 10 seconds default
