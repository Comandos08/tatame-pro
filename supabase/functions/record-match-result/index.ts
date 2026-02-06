/**
 * record-match-result — P2.5 Match Result Recording
 * 
 * Records the winner of a bracket match via atomic RPC.
 * Winner is automatically advanced to the next round.
 * Once recorded, the match becomes immutable.
 * 
 * SECURITY:
 * - Requires ADMIN_TENANT or SUPERADMIN role
 * - Validates impersonation for superadmin
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireTenantRole } from "../_shared/requireTenantRole.ts";
import { requireImpersonationIfSuperadmin, extractImpersonationId } from "../_shared/requireImpersonationIfSuperadmin.ts";
import { requireActiveTenantBillingWrite } from "../_shared/requireActiveTenantBillingWrite.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-impersonation-id',
};

interface RecordResultRequest {
  matchId: string;
  winnerRegistrationId: string;
  impersonationId?: string;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1️⃣ Parse request
    const body: RecordResultRequest = await req.json();
    const { matchId, winnerRegistrationId } = body;
    const impersonationId = extractImpersonationId(req, body);

    console.log('[RECORD-RESULT] Request:', { matchId, winnerRegistrationId, hasImpersonation: !!impersonationId });

    if (!matchId) {
      return new Response(
        JSON.stringify({ error: 'matchId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!winnerRegistrationId) {
      return new Response(
        JSON.stringify({ error: 'winnerRegistrationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2️⃣ Create clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error('[RECORD-RESULT] Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3️⃣ Get match to find tenant
    const { data: match, error: matchError } = await supabaseAdmin
      .from('event_bracket_matches')
      .select('id, tenant_id, bracket_id, status, deleted_at')
      .eq('id', matchId)
      .single();

    if (matchError || !match) {
      console.error('[RECORD-RESULT] Match not found:', matchError);
      return new Response(
        JSON.stringify({ error: 'Match not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (match.deleted_at) {
      return new Response(
        JSON.stringify({ error: 'Cannot record result on deleted match' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (match.status === 'COMPLETED') {
      return new Response(
        JSON.stringify({ error: 'Match result is already recorded' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (match.status === 'BYE') {
      return new Response(
        JSON.stringify({ error: 'Cannot record result for BYE match' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = match.tenant_id;

    // 4️⃣ P3.4 + P3.5: Check tenant ACTIVE + billing allows writes (with audit)
    const billingGate = await requireActiveTenantBillingWrite({
      supabase: supabaseAdmin,
      tenantId,
      userId: user.id,
      domain: 'EVENTS',
      operation: 'record_match_result',
    });
    if (!billingGate.ok) {
      console.warn('[RECORD-RESULT] Billing gate failed:', billingGate.code);
      return new Response(
        JSON.stringify({ ok: false, code: billingGate.code, error: billingGate.error }),
        { status: billingGate.httpStatus ?? 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5️⃣ Check role
    const roleCheck = await requireTenantRole(
      supabaseAdmin, 
      req.headers.get('Authorization'), 
      tenantId, 
      ['ADMIN_TENANT']
    );
    if (!roleCheck.allowed) {
      console.warn('[RECORD-RESULT] Role check failed:', roleCheck.error);
      return new Response(
        JSON.stringify({ error: roleCheck.error }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6️⃣ Check impersonation if superadmin
    const impersonationCheck = await requireImpersonationIfSuperadmin(
      supabaseAdmin,
      user.id,
      tenantId,
      impersonationId
    );

    if (!impersonationCheck.valid) {
      console.warn('[RECORD-RESULT] Impersonation check failed:', impersonationCheck.error);
      return new Response(
        JSON.stringify({ error: impersonationCheck.error }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6️⃣ Call transactional RPC
    const { data: rpcResult, error: rpcError } = await supabaseAdmin
      .rpc('record_match_result_rpc', {
        p_match_id: matchId,
        p_winner_registration_id: winnerRegistrationId,
        p_recorded_by: user.id,
      });

    if (rpcError) {
      console.error('[RECORD-RESULT] RPC error:', rpcError);
      return new Response(
        JSON.stringify({ error: rpcError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[RECORD-RESULT] Success:', rpcResult);

    return new Response(
      JSON.stringify(rpcResult),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[RECORD-RESULT] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
