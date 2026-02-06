/**
 * generate-event-bracket — P2.4 Bracket Generation (RPC Orchestrator)
 * 
 * Orchestrates bracket generation by calling the transactional SQL RPC.
 * Edge Function handles validation only; all mutations are atomic in DB.
 * 
 * SECURITY:
 * - Requires ADMIN_TENANT or SUPERADMIN role
 * - Validates impersonation for superadmin
 * - All mutations via transactional RPC (zero inconsistent state)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireTenantRole } from "../_shared/requireTenantRole.ts";
import { requireImpersonationIfSuperadmin, extractImpersonationId } from "../_shared/requireImpersonationIfSuperadmin.ts";
import { requireActiveTenantBillingWrite } from "../_shared/requireActiveTenantBillingWrite.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-impersonation-id',
};

interface GenerateBracketRequest {
  categoryId: string;
  eventId: string;
  impersonationId?: string;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1️⃣ Parse request
    const body: GenerateBracketRequest = await req.json();
    const { categoryId, eventId } = body;
    const impersonationId = extractImpersonationId(req, body);

    console.log('[GENERATE-BRACKET] Request:', { categoryId, eventId, hasImpersonation: !!impersonationId });

    if (!categoryId || !eventId) {
      return new Response(
        JSON.stringify({ error: 'categoryId and eventId are required' }),
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
      console.error('[GENERATE-BRACKET] Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3️⃣ Get category and validate tenant
    const { data: category, error: catError } = await supabaseAdmin
      .from('event_categories')
      .select('id, tenant_id, event_id, name, deleted_at')
      .eq('id', categoryId)
      .single();

    if (catError || !category) {
      console.error('[GENERATE-BRACKET] Category not found:', catError);
      return new Response(
        JSON.stringify({ error: 'Category not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (category.deleted_at) {
      return new Response(
        JSON.stringify({ error: 'Cannot generate bracket for deleted category' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = category.tenant_id;

    // 4️⃣ P3.4: Check tenant ACTIVE + billing allows writes
    const billingGate = await requireActiveTenantBillingWrite(supabaseAdmin, tenantId, 'generate-event-bracket');
    if (!billingGate.ok) {
      console.warn('[GENERATE-BRACKET] Billing gate failed:', billingGate.code);
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
      console.warn('[GENERATE-BRACKET] Role check failed:', roleCheck.error);
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
      console.warn('[GENERATE-BRACKET] Impersonation check failed:', impersonationCheck.error);
      return new Response(
        JSON.stringify({ error: impersonationCheck.error }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6️⃣ Validate event status
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, status, deleted_at')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      console.error('[GENERATE-BRACKET] Event not found:', eventError);
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (event.deleted_at) {
      return new Response(
        JSON.stringify({ error: 'Cannot generate bracket for deleted event' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allowedStatuses = ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'];
    if (!allowedStatuses.includes(event.status)) {
      return new Response(
        JSON.stringify({ 
          error: `Cannot generate bracket when event status is ${event.status}. Allowed: ${allowedStatuses.join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7️⃣ Fetch registrations deterministically (for RPC payload)
    const { data: registrations, error: regError } = await supabaseAdmin
      .from('event_registrations')
      .select('id, athlete_id, created_at')
      .eq('category_id', categoryId)
      .eq('event_id', eventId)
      .neq('status', 'CANCELED')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (regError) {
      console.error('[GENERATE-BRACKET] Registration fetch error:', regError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch registrations' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!registrations || registrations.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No active registrations in this category' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[GENERATE-BRACKET] Registrations found:', registrations.length);

    // 8️⃣ Prepare payload for RPC
    const registrationsPayload = registrations.map(r => ({
      id: r.id,
      athlete_id: r.athlete_id,
      created_at: r.created_at,
    }));

    // 9️⃣ Call transactional RPC (atomic bracket + matches creation)
    const { data: rpcResult, error: rpcError } = await supabaseAdmin
      .rpc('generate_event_bracket_rpc', {
        p_tenant_id: tenantId,
        p_event_id: eventId,
        p_category_id: categoryId,
        p_generated_by: user.id,
        p_registrations: registrationsPayload,
      });

    if (rpcError) {
      console.error('[GENERATE-BRACKET] RPC error:', rpcError);
      // Check for specific errors
      const errorMessage = rpcError.message || 'Failed to generate bracket';
      const isDraftExists = errorMessage.includes('Draft bracket already exists');
      
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          code: isDraftExists ? 'DRAFT_EXISTS' : 'RPC_ERROR'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[GENERATE-BRACKET] Success via RPC:', rpcResult);

    return new Response(
      JSON.stringify(rpcResult),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[GENERATE-BRACKET] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
