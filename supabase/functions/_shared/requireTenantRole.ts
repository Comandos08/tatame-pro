/**
 * 🔐 requireTenantRole — Backend Role Enforcement for Edge Functions
 * 
 * Utility function to validate user roles in edge functions.
 * DENY BY DEFAULT — returns false on any error.
 * 
 * @example
 * const { allowed, userId, roles } = await requireTenantRole(
 *   supabaseAdmin,
 *   authHeader,
 *   tenantId,
 *   ['ADMIN_TENANT', 'STAFF_ORGANIZACAO']
 * );
 * 
 * if (!allowed) {
 *   return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
 * }
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type EdgeAppRole =
  | 'SUPERADMIN_GLOBAL'
  | 'ADMIN_TENANT'
  | 'STAFF_ORGANIZACAO'
  | 'COACH_PRINCIPAL'
  | 'COACH_ASSISTENTE'
  | 'INSTRUTOR'
  | 'RECEPCAO'
  | 'ATLETA'
  | 'RESPONSAVELLEGAL';

export interface RoleCheckResult {
  /** Whether access is allowed */
  allowed: boolean;
  /** The user ID if authenticated */
  userId: string | null;
  /** Roles the user has in the tenant */
  roles: EdgeAppRole[];
  /** Whether user is a global superadmin */
  isGlobalSuperadmin: boolean;
  /** Error message if any */
  error?: string;
}

/**
 * Check if the authenticated user has any of the required roles in a tenant.
 * 
 * SECURITY:
 * - Uses service role client for privileged queries
 * - Validates JWT token
 * - Checks user_roles table directly
 * - Deny by default on any error
 * 
 * @param supabaseAdmin - Supabase client with service role
 * @param authHeader - Authorization header from request
 * @param tenantId - Tenant ID to check roles for
 * @param allowedRoles - Array of roles that are allowed
 * @returns RoleCheckResult
 */
export async function requireTenantRole(
  supabaseAdmin: SupabaseClient,
  authHeader: string | null,
  tenantId: string,
  allowedRoles: EdgeAppRole[]
): Promise<RoleCheckResult> {
  // Default deny result
  const denyResult: RoleCheckResult = {
    allowed: false,
    userId: null,
    roles: [],
    isGlobalSuperadmin: false,
  };

  try {
    // 1. Validate auth header
    if (!authHeader?.startsWith('Bearer ')) {
      return { ...denyResult, error: 'Missing or invalid Authorization header' };
    }

    const token = authHeader.replace('Bearer ', '');

    // 2. Verify token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return { ...denyResult, error: 'Invalid or expired token' };
    }

    const userId = user.id;

    // 3. Check for global superadmin (tenant_id IS NULL)
    const { data: globalRole } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('role', 'SUPERADMIN_GLOBAL')
      .is('tenant_id', null)
      .maybeSingle();

    const isGlobalSuperadmin = !!globalRole;

    // Superadmin can do anything
    if (isGlobalSuperadmin) {
      return {
        allowed: true,
        userId,
        roles: ['SUPERADMIN_GLOBAL'],
        isGlobalSuperadmin: true,
      };
    }

    // 4. Fetch user's roles for this specific tenant
    const { data: userRoles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId);

    if (rolesError) {
      console.error('requireTenantRole: Error fetching roles', rolesError);
      return { ...denyResult, userId, error: 'Error fetching roles' };
    }

    const roles = (userRoles || []).map(r => r.role as EdgeAppRole);

    // 5. Check if user has any of the allowed roles
    const hasAllowedRole = roles.some(role => allowedRoles.includes(role));

    if (!hasAllowedRole) {
      return {
        allowed: false,
        userId,
        roles,
        isGlobalSuperadmin: false,
        error: `User lacks required roles. Has: [${roles.join(', ')}], Required: [${allowedRoles.join(', ')}]`,
      };
    }

    // 6. Access granted
    return {
      allowed: true,
      userId,
      roles,
      isGlobalSuperadmin: false,
    };

  } catch (err) {
    console.error('requireTenantRole: Unexpected error', err);
    return { ...denyResult, error: 'Unexpected error during role check' };
  }
}

/**
 * Quick check if user is global superadmin.
 * Useful for admin-only endpoints.
 */
export async function requireGlobalSuperadmin(
  supabaseAdmin: SupabaseClient,
  authHeader: string | null
): Promise<{ allowed: boolean; userId: string | null; error?: string }> {
  const result = await requireTenantRole(
    supabaseAdmin,
    authHeader,
    '', // Not checking tenant-specific roles
    ['SUPERADMIN_GLOBAL']
  );

  return {
    allowed: result.isGlobalSuperadmin,
    userId: result.userId,
    error: result.isGlobalSuperadmin ? undefined : 'Superadmin access required',
  };
}

/**
 * Create a standardized 403 Forbidden response.
 */
export function forbiddenResponse(message: string = 'Forbidden'): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { 
      status: 403, 
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      } 
    }
  );
}

/**
 * Create a standardized 401 Unauthorized response.
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { 
      status: 401, 
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      } 
    }
  );
}
