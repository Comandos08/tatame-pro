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
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";


interface GenerateBracketRequest {
  categoryId: string;
  eventId: string;
  impersonationId?: string;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("generate-event-bracket", correlationId);

  try {
    // 1️⃣ Parse request
    const body: GenerateBracketRequest = await req.json();
    const { categoryId, eventId } = body;
    const impersonationId = extractImpersonationId(req, body);

    log.info("Request", { categoryId, eventId, hasImpersonation: !!impersonationId });

    if (!categoryId || !eventId) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.required_field", false, ["categoryId and eventId are required"], correlationId),
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

    // 3️⃣ Get category and validate tenant
    const { data: category, error: catError } = await supabaseAdmin
      .from('event_categories')
      .select('id, tenant_id, event_id, name, deleted_at')
      .eq('id', categoryId)
      .maybeSingle();

    if (catError || !category) {
      log.error("Category not found", catError);
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "data.not_found", false, ["category"], correlationId),
        dynamicCors,
      );
    }

    if (category.deleted_at) {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.invalid_state", false, ["category is deleted"], correlationId),
        dynamicCors,
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
      operation: 'generate_event_bracket',
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

    // 6️⃣ Validate event status
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, status, deleted_at')
      .eq('id', eventId)
      .maybeSingle();

    if (eventError || !event) {
      log.error("Event not found", eventError);
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "data.not_found", false, ["event"], correlationId),
        dynamicCors,
      );
    }

    if (event.deleted_at) {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.invalid_state", false, ["event is deleted"], correlationId),
        dynamicCors,
      );
    }

    const allowedStatuses = ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'];
    if (!allowedStatuses.includes(event.status)) {
      return errorResponse(
        409,
        buildErrorEnvelope(
          ERROR_CODES.CONFLICT,
          "data.invalid_state",
          false,
          [`event status is ${event.status}; allowed: ${allowedStatuses.join(', ')}`],
          correlationId,
        ),
        dynamicCors,
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
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.query_failed", false, ["failed to fetch registrations"], correlationId),
        dynamicCors,
      );
    }

    if (!registrations || registrations.length === 0) {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.invalid_state", false, ["no active registrations in this category"], correlationId),
        dynamicCors,
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
      const errorMessage = rpcError.message || 'Failed to generate bracket';
      const isDraftExists = errorMessage.includes('Draft bracket already exists');
      return errorResponse(
        isDraftExists ? 409 : 400,
        buildErrorEnvelope(
          isDraftExists ? ERROR_CODES.CONFLICT : ERROR_CODES.RPC_ERROR,
          isDraftExists ? "data.draft_bracket_exists" : "system.rpc_failed",
          false,
          [`generate_event_bracket_rpc: ${errorMessage}`],
          correlationId,
        ),
        dynamicCors,
      );
    }

    log.info("Success via RPC", { result: rpcResult });

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
