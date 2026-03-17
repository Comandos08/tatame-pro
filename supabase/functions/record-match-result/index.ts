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
import { assertTenantAccess, TenantBoundaryError } from "../_shared/tenant-boundary.ts";
import { requireImpersonationIfSuperadmin, extractImpersonationId } from "../_shared/requireImpersonationIfSuperadmin.ts";
import { requireActiveTenantBillingWrite } from "../_shared/requireActiveTenantBillingWrite.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";


interface RecordResultRequest {
  matchId: string;
  winnerRegistrationId: string;
  impersonationId?: string;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("record-match-result", correlationId);

  try {
    // 1️⃣ Parse request
    const body: RecordResultRequest = await req.json();
    const { matchId, winnerRegistrationId } = body;
    const impersonationId = extractImpersonationId(req, body);

    log.info("Request", { matchId, winnerRegistrationId, hasImpersonation: !!impersonationId });

    if (!matchId) {
      return new Response(
        JSON.stringify({ error: 'matchId is required' }),
        { status: 400, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
      );
    }

    if (!winnerRegistrationId) {
      return new Response(
        JSON.stringify({ error: 'winnerRegistrationId is required' }),
        { status: 400, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
      );
    }

    // 2️⃣ Create clients
    // PI-SAFE-GOLD-GATE-TRACE-001 — FAIL-FAST ENV VALIDATION (P0)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
      );
    }
    // PI-AUTH-CLIENT-SPLIT-001: supabaseAdmin for DB ops, supabaseAuth for JWT validation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      log.error("Auth error", authError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
      );
    }

    // 3️⃣ Get match to find tenant
    const { data: match, error: matchError } = await supabaseAdmin
      .from('event_bracket_matches')
      .select('id, tenant_id, bracket_id, status, deleted_at')
      .eq('id', matchId)
      .maybeSingle();

    if (matchError || !match) {
      log.error("Match not found", matchError);
      return new Response(
        JSON.stringify({ error: 'Match not found' }),
        { status: 404, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
      );
    }

    if (match.deleted_at) {
      return new Response(
        JSON.stringify({ error: 'Cannot record result on deleted match' }),
        { status: 400, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
      );
    }

    if (match.status === 'COMPLETED') {
      return new Response(
        JSON.stringify({ error: 'Match result is already recorded' }),
        { status: 400, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
      );
    }

    if (match.status === 'BYE') {
      return new Response(
        JSON.stringify({ error: 'Cannot record result for BYE match' }),
        { status: 400, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = match.tenant_id;

    // A04 — Tenant Boundary Check (Zero-Trust)
    try {
      await assertTenantAccess(supabaseAdmin, user.id, tenantId, impersonationId);
      log.info("Tenant boundary check passed");
    } catch (boundaryError) {
      if (boundaryError instanceof TenantBoundaryError) {
        log.warn("Tenant boundary violation", { code: boundaryError.code });
        return new Response(
          JSON.stringify({ ok: false, code: boundaryError.code, error: "Access denied" }),
          { status: 403, headers: { ...dynamicCors, "Content-Type": "application/json" } }
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
      operation: 'record_match_result',
    });
    if (!billingGate.ok) {
      log.warn("Billing gate failed", { code: billingGate.code });
      return new Response(
        JSON.stringify({ ok: false, code: billingGate.code, error: billingGate.error }),
        { status: billingGate.httpStatus ?? 403, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
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
        { status: 403, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
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
        { status: 403, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
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
      log.error("RPC error", rpcError);
      return new Response(
        JSON.stringify({ error: rpcError.message }),
        { status: 400, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
      );
    }

    log.info("Success", { result: rpcResult });

    return new Response(
      JSON.stringify(rpcResult),
      { status: 200, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    log.error("Unexpected error", err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
    );
  }
});
