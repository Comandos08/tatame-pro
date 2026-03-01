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
import { assertTenantAccess, TenantBoundaryError } from "../_shared/tenant-boundary.ts";
import { requireImpersonationIfSuperadmin, extractImpersonationId } from "../_shared/requireImpersonationIfSuperadmin.ts";
import { requireActiveTenantBillingWrite } from "../_shared/requireActiveTenantBillingWrite.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";

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

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("generate-event-bracket", correlationId);

  try {
    // 1️⃣ Parse request
    const body: GenerateBracketRequest = await req.json();
    const { categoryId, eventId } = body;
    const impersonationId = extractImpersonationId(req, body);

    log.info("Request", { categoryId, eventId, hasImpersonation: !!impersonationId });

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
      log.error("Auth error", authError);
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
      .maybeSingle();

    if (catError || !category) {
      log.error("Category not found", catError);
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

    // A04 — Tenant Boundary Check (Zero-Trust)
    try {
      await assertTenantAccess(supabaseAdmin, user.id, tenantId, impersonationId);
      log.info("Tenant boundary check passed");
    } catch (boundaryError) {
      if (boundaryError instanceof TenantBoundaryError) {
        log.warn("Tenant boundary violation", { code: boundaryError.code });
        return new Response(
          JSON.stringify({ ok: false, code: boundaryError.code, error: "Access denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw boundaryError;
    }

    // 4️⃣ P3.4 + P3.5: Check tenant ACTIVE + billing allows writes (with audit)
    const billingGate = await requireActiveTenantBillingWrite({
      supabase: supabaseAdmin,
      tenantId,
      userId: user.id,
      domain: 'EVENTS',
      operation: 'generate_event_bracket',
    });
    if (!billingGate.ok) {
      log.warn("Billing gate failed", { code: billingGate.code });
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
      log.warn("Role check failed", { error: roleCheck.error });
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
      log.warn("Impersonation check failed", { error: impersonationCheck.error });
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
      .maybeSingle();

    if (eventError || !event) {
      log.error("Event not found", eventError);
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
      log.error("Registration fetch error", regError);
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

    log.info("Registrations found", { count: registrations.length });

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
      log.error("RPC error", rpcError);
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

    log.info("Success via RPC", { result: rpcResult });

    return new Response(
      JSON.stringify(rpcResult),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    log.error("Unexpected error", err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
