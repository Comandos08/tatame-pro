/**
 * @contract requireTenantActive
 * 
 * SAFE GOLD — PI-D6.1.1: Tenant Lifecycle Guard
 * 
 * PURPOSE:
 *   Validates that a tenant is in ACTIVE lifecycle status before
 *   allowing critical operations (document emission, etc.)
 * 
 * BEHAVIOR:
 *   - FAIL-CLOSED: Any error = blocked access
 *   - Returns structured result with status information
 *   - Does NOT throw exceptions
 * 
 * USAGE:
 *   const check = await requireTenantActive(supabase, tenantId);
 *   if (!check.allowed) {
 *     return tenantNotActiveResponse(check.status);
 *   }
 * 
 * INVARIANT (I4):
 *   - Tenant in SETUP: destructive operations blocked
 *   - Tenant in BLOCKED: ALL operations blocked
 *   - Only ACTIVE status allows critical operations
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * Valid tenant lifecycle statuses (matches database enum)
 */
export type TenantLifecycleStatus = 'SETUP' | 'ACTIVE' | 'BLOCKED';

/**
 * Result of tenant active check
 */
export interface TenantActiveCheckResult {
  allowed: boolean;
  status: TenantLifecycleStatus | null;
  error?: string;
  code?: 'TENANT_NOT_FOUND' | 'TENANT_NOT_ACTIVE' | 'TENANT_BLOCKED' | 'TENANT_SETUP';
}

/**
 * CORS headers for responses
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Validates that tenant is in ACTIVE lifecycle status.
 * 
 * FAIL-CLOSED: Any error = blocked access.
 * 
 * @param supabase - Supabase client (service role)
 * @param tenantId - UUID of the tenant to validate
 * @returns TenantActiveCheckResult
 */
export async function requireTenantActive(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantActiveCheckResult> {
  try {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!tenantId || !uuidRegex.test(tenantId)) {
      return { 
        allowed: false, 
        status: null, 
        error: 'Invalid tenant ID format',
        code: 'TENANT_NOT_FOUND'
      };
    }

    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('lifecycle_status')
      .eq('id', tenantId)
      .maybeSingle();

    // FAIL-CLOSED: Any error = blocked
    if (error) {
      console.error('[requireTenantActive] Database error:', error.message);
      return { 
        allowed: false, 
        status: null, 
        error: 'Tenant lookup failed',
        code: 'TENANT_NOT_FOUND'
      };
    }

    if (!tenant) {
      return { 
        allowed: false, 
        status: null, 
        error: 'Tenant not found',
        code: 'TENANT_NOT_FOUND'
      };
    }

    const status = (tenant.lifecycle_status as TenantLifecycleStatus) || 'ACTIVE';

    // Check lifecycle status
    if (status === 'BLOCKED') {
      return { 
        allowed: false, 
        status,
        error: 'Tenant is blocked',
        code: 'TENANT_BLOCKED'
      };
    }

    if (status === 'SETUP') {
      return { 
        allowed: false, 
        status,
        error: 'Tenant is in setup mode',
        code: 'TENANT_SETUP'
      };
    }

    if (status !== 'ACTIVE') {
      return { 
        allowed: false, 
        status,
        error: `Tenant not active: ${status}`,
        code: 'TENANT_NOT_ACTIVE'
      };
    }

    return { allowed: true, status: 'ACTIVE' };

  } catch (err) {
    // FAIL-CLOSED: Exception = blocked
    console.error('[requireTenantActive] Exception:', err);
    return { 
      allowed: false, 
      status: null, 
      error: 'Tenant validation failed',
      code: 'TENANT_NOT_FOUND'
    };
  }
}

/**
 * Creates a standard HTTP response for tenant not active.
 * 
 * Returns HTTP 200 with neutral error (SAFE GOLD - no semantic leak).
 * 
 * @param status - Current tenant status (for logging, not exposed)
 * @returns Response object
 */
export function tenantNotActiveResponse(
  status: TenantLifecycleStatus | null
): Response {
  // Log internally but don't expose status to client
  console.log('[requireTenantActive] Blocked operation for tenant status:', status);
  
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Operation blocked',
      code: 'TENANT_NOT_ACTIVE'
    }),
    {
      status: 200, // SAFE GOLD: Always 200 for neutral error
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}
