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
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";


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
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.required_field", false, ["matchId is required"], correlationId),
        dynamicCors,
      );
    }

    if (!winnerRegistrationId) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.required_field", false, ["winnerRegistrationId is required"], correlationId),
        dynamicCors,
      );
    }

    // 2️⃣ Create clients
    // PI-SAFE-GOLD-GATE-TRACE-001 — FAIL-FAST ENV VALIDATION (P0)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.misconfigured", false, undefined, correlationId),
        dynamicCors,
      );
    }
    // PI-AUTH-CLIENT-SPLIT-001: supabaseAdmin for DB ops, supabaseAuth for JWT validation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.missing_token", false, undefined, correlationId),
        dynamicCors,
      );
    }

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      log.error("Auth error", authError);
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.invalid_token", false, undefined, correlationId),
        dynamicCors,
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
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "data.not_found", false, ["match"], correlationId),
        dynamicCors,
      );
    }

    if (match.deleted_at) {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.invalid_state", false, ["match is deleted"], correlationId),
        dynamicCors,
      );
    }

    if (match.status === 'COMPLETED') {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.invalid_state", false, ["match already completed"], correlationId),
        dynamicCors,
      );
    }

    if (match.status === 'BYE') {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.invalid_state", false, ["match is BYE"], correlationId),
        dynamicCors,
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
        return errorResponse(
          403,
          buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.tenant_boundary", false, [boundaryError.code], correlationId),
          dynamicCors,
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
      return errorResponse(
        billingGate.httpStatus ?? 403,
        buildErrorEnvelope(ERROR_CODES.BILLING_BLOCKED, "billing.write_blocked", false, [billingGate.code, billingGate.error].filter(Boolean) as string[], correlationId),
        dynamicCors,
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
      return errorResponse(
        403,
        buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.forbidden", false, roleCheck.error ? [roleCheck.error] : undefined, correlationId),
        dynamicCors,
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
      return errorResponse(
        403,
        buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.impersonation_required", false, impersonationCheck.error ? [impersonationCheck.error] : undefined, correlationId),
        dynamicCors,
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
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.RPC_ERROR, "system.rpc_failed", false, [`record_match_result_rpc: ${rpcError.message || "unknown error"}`], correlationId),
        dynamicCors,
      );
    }

    log.info("Success", { result: rpcResult });

    return okResponse(rpcResult, dynamicCors, correlationId);

  } catch (err) {
    log.error("Unexpected error", err);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
      dynamicCors,
    );
  }
});
