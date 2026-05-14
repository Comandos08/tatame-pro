/**
 * publish-event-bracket — P2.4 Bracket Publication
 * 
 * Transitions a bracket from DRAFT to PUBLISHED status.
 * Once published, the bracket becomes immutable (enforced by DB trigger).
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


interface PublishBracketRequest {
  bracketId: string;
  impersonationId?: string;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("publish-event-bracket", correlationId);

  try {
    // 1️⃣ Parse request
    const body: PublishBracketRequest = await req.json();
    const { bracketId } = body;
    const impersonationId = extractImpersonationId(req, body);

    log.info("Request", { bracketId, hasImpersonation: !!impersonationId });

    if (!bracketId) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.required_field", false, ["bracketId is required"], correlationId),
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

    // 3️⃣ Get bracket
    const { data: bracket, error: bracketError } = await supabaseAdmin
      .from('event_brackets')
      .select('id, tenant_id, status, version, deleted_at')
      .eq('id', bracketId)
      .maybeSingle();

    if (bracketError || !bracket) {
      log.error("Bracket not found", bracketError);
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "data.not_found", false, ["bracket"], correlationId),
        dynamicCors,
      );
    }

    if (bracket.deleted_at) {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.invalid_state", false, ["bracket is deleted"], correlationId),
        dynamicCors,
      );
    }

    if (bracket.status === 'PUBLISHED') {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.invalid_state", false, ["bracket already published"], correlationId),
        dynamicCors,
      );
    }

    const tenantId = bracket.tenant_id;

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
      operation: 'publish_event_bracket',
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

    // 6️⃣ Publish bracket
    const { error: updateError } = await supabaseAdmin
      .from('event_brackets')
      .update({
        status: 'PUBLISHED',
        published_at: new Date().toISOString(),
      })
      .eq('id', bracketId);

    if (updateError) {
      log.error("Update error", updateError);
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.query_failed", false, [`failed to publish bracket: ${updateError.message}`], correlationId),
        dynamicCors,
      );
    }

    log.info("Success! Bracket published", { bracketId, version: bracket.version });

    return okResponse(
      {
        success: true,
        bracketId,
        version: bracket.version,
        status: 'PUBLISHED',
        publishedAt: new Date().toISOString(),
      },
      dynamicCors,
      correlationId,
    );

  } catch (err) {
    log.error("Unexpected error", err);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
      dynamicCors,
    );
  }
});
