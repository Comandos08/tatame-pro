/**
 * 🔐 start-impersonation — Create a scoped impersonation session
 * 
 * Creates a time-limited impersonation session for a SUPERADMIN_GLOBAL user
 * to access a specific tenant's resources with full audit trail.
 * 
 * Security Rules:
 * - Only SUPERADMIN_GLOBAL (tenant_id IS NULL) can start impersonation
 * - Sessions have a hard cap of 60 minutes TTL
 * - All sessions are logged to audit_logs
 * - Target tenant must exist and be active
 * - Rate limited: 10 per hour per superadmin
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TTL_MINUTES = 60;

interface StartImpersonationRequest {
  targetTenantId: string;
  reason?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1️⃣ Validate Authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2️⃣ Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 3️⃣ Get and verify caller
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3.5️⃣ Rate limiting (before permission check)
    const rateLimiter = SecureRateLimitPresets.startImpersonation();
    const rateLimitCtx = buildRateLimitContext(req, user.id, null);
    const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabaseAdmin);

    if (!rateLimitResult.allowed) {
      console.warn(`[START-IMPERSONATION] Rate limit exceeded for ${user.id}`);
      return rateLimiter.tooManyRequestsResponse(rateLimitResult, corsHeaders);
    }

    // 4️⃣ Verify SUPERADMIN_GLOBAL role (tenant_id IS NULL)
    const { data: superadminRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .is('tenant_id', null)
      .eq('role', 'SUPERADMIN_GLOBAL')
      .maybeSingle();

    if (roleError || !superadminRole) {
      console.warn(`[START-IMPERSONATION] Unauthorized attempt by user ${user.id}`);
      return new Response(
        JSON.stringify({ error: 'Only SUPERADMIN_GLOBAL can start impersonation' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5️⃣ Parse and validate request body
    const body: StartImpersonationRequest = await req.json();
    const { targetTenantId, reason } = body;

    if (!targetTenantId || typeof targetTenantId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'targetTenantId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6️⃣ Verify target tenant exists and is valid
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, name, slug, is_active')
      .eq('id', targetTenantId)
      .maybeSingle();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: 'Target tenant not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7️⃣ End any existing ACTIVE sessions for this superadmin
    await supabaseAdmin
      .from('superadmin_impersonations')
      .update({ 
        status: 'ENDED', 
        ended_at: new Date().toISOString(),
        ended_by_profile_id: user.id
      })
      .eq('superadmin_user_id', user.id)
      .eq('status', 'ACTIVE');

    // 8️⃣ Create new impersonation session
    const expiresAt = new Date(Date.now() + MAX_TTL_MINUTES * 60 * 1000);
    
    const { data: session, error: insertError } = await supabaseAdmin
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

    if (insertError || !session) {
      console.error('[START-IMPERSONATION] Failed to create session:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create impersonation session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 9️⃣ Log audit event
    await createAuditLog(supabaseAdmin, {
      event_type: 'IMPERSONATION_STARTED',
      tenant_id: targetTenantId,
      profile_id: user.id,
      metadata: {
        impersonation_id: session.id,
        superadmin_user_id: user.id,
        target_tenant_id: targetTenantId,
        target_tenant_name: tenant.name,
        target_tenant_slug: tenant.slug,
        expires_at: expiresAt.toISOString(),
        reason: reason || undefined,
        automatic: false,
      },
    });

    console.log(`[START-IMPERSONATION] Session ${session.id} created for superadmin ${user.id} -> tenant ${tenant.slug}`);

    // 🔟 Return session details
    return new Response(
      JSON.stringify({
        impersonationId: session.id,
        targetTenantId: tenant.id,
        targetTenantSlug: tenant.slug,
        targetTenantName: tenant.name,
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
