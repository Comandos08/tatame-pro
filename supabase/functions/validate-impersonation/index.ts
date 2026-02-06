/**
 * ============================================================================
 * 🔐 validate-impersonation — Impersonation Session Validator
 * ============================================================================
 * 
 * IMMUTABLE CONTRACT:
 * -------------------
 * This function validates that an impersonation session is still active
 * and not expired. Used by frontend guards and backend functions.
 * 
 * WHAT THIS FUNCTION DOES:
 * - Validates caller owns the session
 * - Checks session status (ACTIVE, ENDED, EXPIRED)
 * - Auto-expires sessions past their TTL
 * - Returns minimal data to prevent information leakage
 * 
 * WHAT THIS FUNCTION DOES NOT DO:
 * - Does NOT create new sessions
 * - Does NOT extend session TTL
 * - Does NOT grant any permissions
 * - Does NOT return sensitive tenant data
 * 
 * SECURITY INVARIANTS:
 * - Only session owner can validate (BY DESIGN)
 * - Expired sessions are automatically marked (INTENTIONAL)
 * - Returns minimal response data (REQUIRED for security)
 * - All expirations are logged (REQUIRED for audit)
 * 
 * ============================================================================
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog } from "../_shared/audit-logger.ts";

// ============================================================================
// CORS HEADERS
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ValidateImpersonationRequest {
  impersonationId: string;
}

/**
 * Response structure for validation.
 * INTENTIONAL: Minimal data to prevent information leakage.
 */
interface ValidateResponse {
  valid: boolean;
  targetTenantId?: string;
  targetTenantSlug?: string;
  expiresAt?: string;
  status?: string;
  remainingMinutes?: number;
}

// ============================================================================
// ENTRYPOINT
// ============================================================================

Deno.serve(async (req) => {
  // --- CORS Preflight ---
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========================================================================
    // STEP 1: Authorization Validation
    // ========================================================================
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 2: Supabase Client Initialization
    // ========================================================================
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // ========================================================================
    // STEP 3: Caller Identity Verification
    // ========================================================================
    const { data: { user: callerUser }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 4: SUPERADMIN_GLOBAL Role Verification
    // INTENTIONAL: Only superadmins can validate impersonation sessions
    // ========================================================================
    const { data: superadminRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', callerUser.id)
      .is('tenant_id', null)
      .eq('role', 'SUPERADMIN_GLOBAL')
      .maybeSingle();

    if (roleError || !superadminRole) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Only SUPERADMIN_GLOBAL can validate impersonation' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 5: Request Body Validation
    // ========================================================================
    const body: ValidateImpersonationRequest = await req.json();
    const { impersonationId } = body;

    if (!impersonationId || typeof impersonationId !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, error: 'impersonationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 6: Fetch Session with Tenant Info
    // ========================================================================
    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from('superadmin_impersonations')
      .select(`
        id, 
        superadmin_user_id, 
        target_tenant_id, 
        status, 
        expires_at, 
        ended_at, 
        created_at,
        tenants:target_tenant_id (slug, name)
      `)
      .eq('id', impersonationId)
      .maybeSingle();

    if (sessionError || !sessionData) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Session not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 7: Ownership Verification
    // BY DESIGN: Only session owner can validate their own session
    // ========================================================================
    if (sessionData.superadmin_user_id !== callerUser.id) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Session belongs to another user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 8: Check if Already Ended
    // ========================================================================
    if (sessionData.ended_at !== null || sessionData.status !== 'ACTIVE') {
      const response: ValidateResponse = {
        valid: false,
        status: sessionData.status,
      };
      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 9: Expiration Check and Auto-Expire
    // INTENTIONAL: Automatic expiration on validation
    // ========================================================================
    const now = new Date();
    const expiresAt = new Date(sessionData.expires_at);
    
    if (now > expiresAt) {
      // Auto-expire the session
      await supabaseAdmin
        .from('superadmin_impersonations')
        .update({
          status: 'EXPIRED',
          ended_at: now.toISOString(),
        })
        .eq('id', impersonationId);

      // Log expiration (REQUIRED for audit trail)
      await createAuditLog(supabaseAdmin, {
        event_type: 'IMPERSONATION_EXPIRED',
        tenant_id: sessionData.target_tenant_id,
        profile_id: callerUser.id,
        metadata: {
          impersonation_id: impersonationId,
          superadmin_user_id: callerUser.id,
          target_tenant_id: sessionData.target_tenant_id,
          started_at: sessionData.created_at,
          expired_at: now.toISOString(),
          automatic: true,
        },
      });

      console.log(`[VALIDATE-IMPERSONATION] Session ${impersonationId} expired`);

      const response: ValidateResponse = {
        valid: false,
        status: 'EXPIRED',
      };
      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 10: Valid Session Response
    // ========================================================================
    const remainingMs = expiresAt.getTime() - now.getTime();
    const remainingMinutes = Math.floor(remainingMs / 60000);
    
    // deno-lint-ignore no-explicit-any
    const tenantData = sessionData.tenants as any;
    
    const response: ValidateResponse = {
      valid: true,
      targetTenantId: sessionData.target_tenant_id,
      targetTenantSlug: tenantData?.slug || undefined,
      expiresAt: sessionData.expires_at,
      status: 'ACTIVE',
      remainingMinutes,
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[VALIDATE-IMPERSONATION] Unexpected error:', error);
    return new Response(
      JSON.stringify({ valid: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
