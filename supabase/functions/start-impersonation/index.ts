/**
 * ============================================================================
 * 🔐 start-impersonation — Impersonation Session Factory
 * ============================================================================
 * 
 * IMMUTABLE CONTRACT:
 * This function creates time-limited impersonation sessions for SUPERADMIN_GLOBAL
 * users to access tenant resources with full audit trail.
 * 
 * WHAT THIS FUNCTION DOES:
 * - Validates caller is SUPERADMIN_GLOBAL (tenant_id IS NULL)
 * - Enforces rate limiting (10 sessions/hour per superadmin)
 * - Ends any existing ACTIVE sessions for the caller
 * - Creates a new session with 60-minute TTL
 * - Logs session creation to audit_logs
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
import { createAuditLog } from "../_shared/audit-logger.ts";
import {
  SecureRateLimitPresets,
  buildRateLimitContext,
} from "../_shared/secure-rate-limiter.ts";

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
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 4: Rate Limiting
    // BY DESIGN: Applied BEFORE permission check to prevent enumeration
    // ========================================================================
    const rateLimiter = SecureRateLimitPresets.startImpersonation();
    const rateLimitCtx = buildRateLimitContext(req, user.id, null);
    const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabaseAdmin);

    if (!rateLimitResult.allowed) {
      return rateLimiter.tooManyRequestsResponse(rateLimitResult, corsHeaders);
    }

    // ========================================================================
    // STEP 5: SUPERADMIN_GLOBAL Role Verification
    // INTENTIONAL: Only global superadmins (tenant_id IS NULL) can impersonate
    // ========================================================================
    const { data: superadmin, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .is('tenant_id', null)
      .eq('role', 'SUPERADMIN_GLOBAL')
      .maybeSingle();

    if (roleError || !superadmin) {
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
        ended_by_profile_id: user.id
      })
      .eq('superadmin_user_id', user.id)
      .eq('status', 'ACTIVE');

    // ========================================================================
    // STEP 9: Create New Impersonation Session
    // ========================================================================
    const expiresAt = new Date(Date.now() + MAX_TTL_MINUTES * 60 * 1000);
    
    const { data: newSession, error: insertError } = await supabaseAdmin
      .from('superadmin_impersonations')
      .insert({
        superadmin_user_id: user.id,
        target_tenant_id: targetTenantId,
        expires_at: expiresAt.toISOString(),
        status: 'ACTIVE',
        reason: reason || null,
        metadata: {
          user_agent: req.headers.get('user-agent') || 'unknown',
          started_from: 'admin_dashboard',
        },
        created_by_profile_id: user.id,
      })
      .select('id, target_tenant_id, expires_at, status')
      .single();

    if (insertError || !newSession) {
      return new Response(
        JSON.stringify({ error: 'Failed to create impersonation session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 10: Audit Logging
    // REQUIRED: Immutable record of session creation
    // ========================================================================
    await createAuditLog(supabaseAdmin, {
      event_type: 'IMPERSONATION_STARTED',
      tenant_id: targetTenantId,
      profile_id: user.id,
      metadata: {
        impersonation_id: newSession.id,
        superadmin_user_id: user.id,
        target_tenant_id: targetTenantId,
        target_tenant_name: targetTenant.name,
        target_tenant_slug: targetTenant.slug,
        expires_at: expiresAt.toISOString(),
        reason: reason || undefined,
        automatic: false,
      },
    });

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

  } catch (_error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
