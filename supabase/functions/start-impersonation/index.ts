/**
 * ============================================================================
 * 🔐 start-impersonation — Impersonation Session Factory
 * ============================================================================
 * 
 * IMMUTABLE CONTRACT:
 * -------------------
 * This function creates time-limited impersonation sessions for SUPERADMIN_GLOBAL
 * users to access tenant resources with full audit trail.
 * 
 * WHAT THIS FUNCTION DOES:
 * - Validates caller is SUPERADMIN_GLOBAL (tenant_id IS NULL)
 * - Enforces rate limiting (10 sessions/hour per superadmin)
 * - Ends any existing ACTIVE sessions for the caller
 * - Creates a new session with 60-minute TTL
 * - Logs all actions to audit_logs
 * 
 * WHAT THIS FUNCTION DOES NOT DO:
 * - Does NOT grant any roles or permissions
 * - Does NOT modify tenant data
 * - Does NOT bypass RLS policies directly
 * - Does NOT allow impersonation of users (only tenants)
 * 
 * SECURITY INVARIANTS:
 * - Only SUPERADMIN_GLOBAL can start impersonation (BY DESIGN)
 * - Sessions have hard cap of 60 minutes (INTENTIONAL)
 * - Previous sessions are forcibly ended (INTENTIONAL)
 * - All sessions are immutably logged (REQUIRED)
 * - Rate limiting is fail-closed (REQUIRED)
 * 
 * ============================================================================
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
import {
  SecureRateLimitPresets,
  buildRateLimitContext,
} from "../_shared/secure-rate-limiter.ts";
import {
  logSecurityEvent,
  SECURITY_EVENTS,
} from "../_shared/security-logger.ts";
import {
  logRateLimitBlock,
  logPermissionDenied,
} from "../_shared/decision-logger.ts";

// ============================================================================
// CORS HEADERS
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum session duration in minutes.
 * INTENTIONAL: Hard cap to limit exposure window.
 */
const MAX_TTL_MINUTES = 60;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface StartImpersonationRequest {
  targetTenantId: string;
  reason?: string;
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
        JSON.stringify({ error: 'Missing authorization header' }),
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
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 4: Rate Limiting (BEFORE permission check - BY DESIGN)
    // ========================================================================
    const rateLimiter = SecureRateLimitPresets.startImpersonation();
    const rateLimitCtx = buildRateLimitContext(req, callerUser.id, null);
    const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabaseAdmin);

    if (!rateLimitResult.allowed) {
      console.warn(`[START-IMPERSONATION] Rate limit exceeded for ${callerUser.id}`);
      
      // Log decision BEFORE responding (REQUIRED for audit trail)
      const clientIp = req.headers.get('cf-connecting-ip') || 
                 req.headers.get('x-real-ip') || 
                 req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                 'unknown';
      await logRateLimitBlock(supabaseAdmin, {
        operation: 'start-impersonation',
        user_id: callerUser.id,
        tenant_id: null,
        ip_address: clientIp,
        count: rateLimitResult.count,
      });
      
      return rateLimiter.tooManyRequestsResponse(rateLimitResult, corsHeaders);
    }

    // ========================================================================
    // STEP 5: SUPERADMIN_GLOBAL Role Verification
    // INTENTIONAL: Only global superadmins (tenant_id IS NULL) can impersonate
    // ========================================================================
    const { data: superadminRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', callerUser.id)
      .is('tenant_id', null)
      .eq('role', 'SUPERADMIN_GLOBAL')
      .maybeSingle();

    if (roleError || !superadminRole) {
      console.warn(`[START-IMPERSONATION] Unauthorized attempt by user ${callerUser.id}`);
      
      // Log permission denied decision BEFORE responding (REQUIRED)
      await logPermissionDenied(supabaseAdmin, {
        operation: 'start-impersonation',
        user_id: callerUser.id,
        tenant_id: null,
        required_roles: ['SUPERADMIN_GLOBAL'],
        reason: 'NOT_SUPERADMIN',
      });
      
      return new Response(
        JSON.stringify({ error: 'Only SUPERADMIN_GLOBAL can start impersonation' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 6: Request Body Validation
    // ========================================================================
    const body: StartImpersonationRequest = await req.json();
    const { targetTenantId, reason } = body;

    if (!targetTenantId || typeof targetTenantId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'targetTenantId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 7: Target Tenant Existence Check
    // ========================================================================
    const { data: targetTenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, name, slug, is_active')
      .eq('id', targetTenantId)
      .maybeSingle();

    if (tenantError || !targetTenant) {
      return new Response(
        JSON.stringify({ error: 'Target tenant not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 8: End Existing ACTIVE Sessions
    // INTENTIONAL: One active session per superadmin at a time
    // ========================================================================
    await supabaseAdmin
      .from('superadmin_impersonations')
      .update({ 
        status: 'ENDED', 
        ended_at: new Date().toISOString(),
        ended_by_profile_id: callerUser.id
      })
      .eq('superadmin_user_id', callerUser.id)
      .eq('status', 'ACTIVE');

    // ========================================================================
    // STEP 9: Create New Impersonation Session
    // ========================================================================
    const expiresAt = new Date(Date.now() + MAX_TTL_MINUTES * 60 * 1000);
    
    const { data: newSession, error: insertError } = await supabaseAdmin
      .from('superadmin_impersonations')
      .insert({
        superadmin_user_id: callerUser.id,
        target_tenant_id: targetTenantId,
        expires_at: expiresAt.toISOString(),
        status: 'ACTIVE',
        reason: reason || null,
        metadata: {
          user_agent: req.headers.get('user-agent') || 'unknown',
          started_from: 'admin_dashboard',
        },
        created_by_profile_id: callerUser.id,
      })
      .select('id, target_tenant_id, expires_at, status')
      .single();

    if (insertError || !newSession) {
      console.error('[START-IMPERSONATION] Failed to create session:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create impersonation session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 10: Audit Logging (REQUIRED - Immutable Record)
    // ========================================================================
    await createAuditLog(supabaseAdmin, {
      event_type: 'IMPERSONATION_STARTED',
      tenant_id: targetTenantId,
      profile_id: callerUser.id,
      metadata: {
        impersonation_id: newSession.id,
        superadmin_user_id: callerUser.id,
        target_tenant_id: targetTenantId,
        target_tenant_name: targetTenant.name,
        target_tenant_slug: targetTenant.slug,
        expires_at: expiresAt.toISOString(),
        reason: reason || undefined,
        automatic: false,
      },
    });

    console.log(`[START-IMPERSONATION] Session ${newSession.id} created for superadmin ${callerUser.id} -> tenant ${targetTenant.slug}`);

    // ========================================================================
    // STEP 11: Success Response
    // ========================================================================
    return new Response(
      JSON.stringify({
        impersonationId: newSession.id,
        targetTenantId: targetTenant.id,
        targetTenantSlug: targetTenant.slug,
        targetTenantName: targetTenant.name,
        expiresAt: expiresAt.toISOString(),
        status: 'ACTIVE',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[START-IMPERSONATION] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
