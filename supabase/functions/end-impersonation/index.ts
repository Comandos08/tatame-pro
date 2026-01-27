/**
 * 🔐 end-impersonation — End an active impersonation session
 * 
 * Ends an impersonation session for a SUPERADMIN_GLOBAL user.
 * Can only end sessions owned by the caller.
 * 
 * Security Rules:
 * - Only the session owner can end their session
 * - Caller must be SUPERADMIN_GLOBAL
 * - All endings are logged to audit_logs
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog } from "../_shared/audit-logger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EndImpersonationRequest {
  impersonationId: string;
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
        JSON.stringify({ error: 'Only SUPERADMIN_GLOBAL can end impersonation' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5️⃣ Parse request body
    const body: EndImpersonationRequest = await req.json();
    const { impersonationId, reason } = body;

    if (!impersonationId || typeof impersonationId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'impersonationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6️⃣ Fetch and verify session ownership
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('superadmin_impersonations')
      .select('id, superadmin_user_id, target_tenant_id, status, created_at, reason')
      .eq('id', impersonationId)
      .maybeSingle();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: 'Impersonation session not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7️⃣ Verify ownership
    if (session.superadmin_user_id !== user.id) {
      console.warn(`[END-IMPERSONATION] User ${user.id} attempted to end session ${impersonationId} owned by ${session.superadmin_user_id}`);
      return new Response(
        JSON.stringify({ error: 'Cannot end session owned by another user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 8️⃣ Check if already ended
    if (session.status !== 'ACTIVE') {
      return new Response(
        JSON.stringify({ 
          ok: true, 
          message: 'Session already ended',
          status: session.status 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 9️⃣ End the session
    const endedAt = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from('superadmin_impersonations')
      .update({
        status: 'ENDED',
        ended_at: endedAt,
        ended_by_profile_id: user.id,
        reason: reason || session.reason || undefined,
      })
      .eq('id', impersonationId);

    if (updateError) {
      console.error('[END-IMPERSONATION] Failed to update session:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to end session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🔟 Log audit event
    await createAuditLog(supabaseAdmin, {
      event_type: 'IMPERSONATION_ENDED',
      tenant_id: session.target_tenant_id,
      profile_id: user.id,
      metadata: {
        impersonation_id: impersonationId,
        superadmin_user_id: user.id,
        target_tenant_id: session.target_tenant_id,
        started_at: session.created_at,
        ended_at: endedAt,
        reason: reason || undefined,
        automatic: false,
      },
    });

    console.log(`[END-IMPERSONATION] Session ${impersonationId} ended by ${user.id}`);

    return new Response(
      JSON.stringify({ ok: true, status: 'ENDED' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[END-IMPERSONATION] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
