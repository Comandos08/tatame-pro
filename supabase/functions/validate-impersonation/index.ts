/**
 * 🔐 validate-impersonation — Validate an impersonation session
 * 
 * Validates that an impersonation session is still active and not expired.
 * Used by frontend guards and backend functions to verify access.
 * 
 * Security Rules:
 * - Only the session owner can validate their session
 * - Expired sessions are automatically marked as EXPIRED
 * - Returns minimal data to prevent information leakage
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog } from "../_shared/audit-logger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidateImpersonationRequest {
  impersonationId: string;
}

interface ValidateResponse {
  valid: boolean;
  targetTenantId?: string;
  targetTenantSlug?: string;
  expiresAt?: string;
  status?: string;
  remainingMinutes?: number;
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
        JSON.stringify({ valid: false, error: 'Missing authorization header' }),
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
        JSON.stringify({ valid: false, error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4️⃣ Verify SUPERADMIN_GLOBAL role
    const { data: superadminRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .is('tenant_id', null)
      .eq('role', 'SUPERADMIN_GLOBAL')
      .maybeSingle();

    if (roleError || !superadminRole) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Only SUPERADMIN_GLOBAL can validate impersonation' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5️⃣ Parse request body
    const body: ValidateImpersonationRequest = await req.json();
    const { impersonationId } = body;

    if (!impersonationId || typeof impersonationId !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, error: 'impersonationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6️⃣ Fetch session with tenant info
    const { data: session, error: sessionError } = await supabaseAdmin
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

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Session not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7️⃣ Verify ownership
    if (session.superadmin_user_id !== user.id) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Session belongs to another user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 8️⃣ Check if already ended
    if (session.ended_at !== null || session.status !== 'ACTIVE') {
      const response: ValidateResponse = {
        valid: false,
        status: session.status,
      };
      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 9️⃣ Check if expired
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    
    if (now > expiresAt) {
      // Auto-expire the session
      await supabaseAdmin
        .from('superadmin_impersonations')
        .update({
          status: 'EXPIRED',
          ended_at: now.toISOString(),
        })
        .eq('id', impersonationId);

      // Log expiration
      await createAuditLog(supabaseAdmin, {
        event_type: 'IMPERSONATION_EXPIRED',
        tenant_id: session.target_tenant_id,
        profile_id: user.id,
        metadata: {
          impersonation_id: impersonationId,
          superadmin_user_id: user.id,
          target_tenant_id: session.target_tenant_id,
          started_at: session.created_at,
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

    // 🔟 Session is valid
    const remainingMs = expiresAt.getTime() - now.getTime();
    const remainingMinutes = Math.floor(remainingMs / 60000);
    
    // deno-lint-ignore no-explicit-any
    const tenantData = session.tenants as any;
    
    const response: ValidateResponse = {
      valid: true,
      targetTenantId: session.target_tenant_id,
      targetTenantSlug: tenantData?.slug || undefined,
      expiresAt: session.expires_at,
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
