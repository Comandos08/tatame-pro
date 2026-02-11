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
 * 
 * A02: Institutional envelope + structured logger + correlationId
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog } from "../_shared/audit-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import {
  SecureRateLimitPresets,
  buildRateLimitContext,
} from "../_shared/secure-rate-limiter.ts";
import {
  okResponse,
  errorResponse,
  buildErrorEnvelope,
  ERROR_CODES,
  unauthorizedResponse,
  forbiddenResponse,
} from "../_shared/errors/envelope.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id, x-impersonation-id',
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

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("end-impersonation", correlationId);

  try {
    // 1️⃣ Validate Authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      log.warn("Missing authorization header");
      return unauthorizedResponse(corsHeaders, "auth.missing_header", undefined, correlationId);
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
      log.warn("Invalid or expired token");
      return unauthorizedResponse(corsHeaders, "auth.invalid_token", undefined, correlationId);
    }

    log.setUser(user.id);

    // 4️⃣ Rate Limiting
    const rateLimiter = SecureRateLimitPresets.endImpersonation();
    const rateLimitCtx = buildRateLimitContext(req, user.id, null);
    const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabaseAdmin);

    if (!rateLimitResult.allowed) {
      log.warn("Rate limit exceeded");
      return rateLimiter.tooManyRequestsResponse(rateLimitResult, corsHeaders, correlationId);
    }

    // 5️⃣ Verify SUPERADMIN_GLOBAL role
    const { data: superadminRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .is('tenant_id', null)
      .eq('role', 'SUPERADMIN_GLOBAL')
      .maybeSingle();

    if (roleError || !superadminRole) {
      log.warn("Non-superadmin attempted end impersonation");
      return forbiddenResponse(corsHeaders, "auth.superadmin_required", undefined, correlationId);
    }

    // 6️⃣ Parse request body
    const body: EndImpersonationRequest = await req.json();
    const { impersonationId, reason } = body;

    if (!impersonationId || typeof impersonationId !== 'string') {
      log.warn("Missing impersonationId");
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.impersonation_id_required", false, undefined, correlationId),
        corsHeaders,
      );
    }

    // 7️⃣ Fetch and verify session ownership
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('superadmin_impersonations')
      .select('id, superadmin_user_id, target_tenant_id, status, created_at, reason')
      .eq('id', impersonationId)
      .maybeSingle();

    if (sessionError || !session) {
      log.warn("Impersonation session not found", { impersonationId });
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "impersonation.session_not_found", false, undefined, correlationId),
        corsHeaders,
      );
    }

    log.setTenant(session.target_tenant_id);

    // 8️⃣ Verify ownership
    if (session.superadmin_user_id !== user.id) {
      log.warn("Attempted to end session owned by another user", { impersonationId, owner: session.superadmin_user_id });
      return forbiddenResponse(corsHeaders, "impersonation.not_owner", undefined, correlationId);
    }

    // 9️⃣ Check if already ended
    if (session.status !== 'ACTIVE') {
      log.info("Session already ended", { status: session.status });
      return okResponse({
        ok: true,
        message: 'Session already ended',
        status: session.status,
      }, corsHeaders, correlationId);
    }

    // 🔟 End the session
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
      log.error("Failed to update session", updateError);
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "impersonation.end_failed", true, undefined, correlationId),
        corsHeaders,
      );
    }

    // 1️⃣1️⃣ Log audit event
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

    log.info("Session ended successfully", { impersonationId });

    return okResponse({ ok: true, status: 'ENDED' }, corsHeaders, correlationId);

  } catch (err) {
    log.error("Unhandled exception", err);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
      corsHeaders,
    );
  }
});
