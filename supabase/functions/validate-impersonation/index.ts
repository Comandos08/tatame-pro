/**
 * ============================================================================
 * 🔐 validate-impersonation — Impersonation Session Validator
 * ============================================================================
 * 
 * IMMUTABLE CONTRACT:
 * This function validates that an impersonation session is still active
 * and not expired. Used by frontend guards and backend functions.
 * 
 * WHAT THIS FUNCTION DOES:
 * - Validates caller owns the session
 * - Checks session status (ACTIVE, ENDED, EXPIRED)
 * - Auto-expires sessions past their TTL
 * - Verifies caller still has SUPERADMIN_GLOBAL role
 * - Verifies target tenant is still active
 * - Returns minimal data to prevent information leakage
 * 
 * WHAT THIS FUNCTION DOES NOT DO:
 * - Does NOT create new sessions
 * - Does NOT extend session TTL
 * - Does NOT grant any permissions
 * - Does NOT return sensitive tenant data
 * 
 * SECURITY INVARIANTS:
 * - Only session owner can validate (BY DESIGN)
 * - Expired sessions are automatically marked (INTENTIONAL)
 * - Returns minimal response data (REQUIRED for security)
 * - All expirations are logged (REQUIRED for audit)
 * 
 * A02: Institutional envelope + structured logger + correlationId
 * ============================================================================
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog } from "../_shared/audit-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import {
  okResponse,
  errorResponse,
  buildErrorEnvelope,
  ERROR_CODES,
  unauthorizedResponse,
  forbiddenResponse,
} from "../_shared/errors/envelope.ts";

// ============================================================================
// CORS HEADERS
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id, x-impersonation-id',
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ValidateImpersonationRequest {
  impersonationId: string;
}

// ============================================================================
// ENTRYPOINT
// ============================================================================

Deno.serve(async (req) => {
  // --- CORS Preflight ---
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("validate-impersonation", correlationId);

  try {
    // ========================================================================
    // STEP 1: Authorization Validation
    // ========================================================================
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      log.warn("Missing authorization header");
      return unauthorizedResponse(corsHeaders, "auth.missing_header", undefined, correlationId);
    }

    // ========================================================================
    // STEP 2: Supabase Client Initialization
    // ========================================================================
    // PI-SAFE-GOLD-GATE-TRACE-001 — FAIL-FAST ENV VALIDATION (P0)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // PI-AUTH-CLIENT-SPLIT-001: supabaseAdmin for DB ops, supabaseUser for JWT validation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // ========================================================================
    // STEP 3: Caller Identity Verification
    // ========================================================================
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      log.warn("Invalid or expired token");
      return unauthorizedResponse(corsHeaders, "auth.invalid_token", undefined, correlationId);
    }

    log.setUser(user.id);

    // ========================================================================
    // STEP 4: SUPERADMIN_GLOBAL Role Re-Verification
    // INTENTIONAL: Re-verify on every validation to catch role revocations
    // ========================================================================
    log.setStep("actor_validated");
    const { data: superadmin, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .is('tenant_id', null)
      .eq('role', 'SUPERADMIN_GLOBAL')
      .maybeSingle();

    if (roleError || !superadmin) {
      log.warn("Caller no longer has SUPERADMIN_GLOBAL role");
      return forbiddenResponse(corsHeaders, "auth.superadmin_required", undefined, correlationId);
    }

    // ========================================================================
    // STEP 5: Request Body Validation
    // ========================================================================
    const body: ValidateImpersonationRequest = await req.json();
    const { impersonationId } = body;

    if (!impersonationId || typeof impersonationId !== 'string') {
      log.warn("Missing impersonationId");
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.impersonation_id_required", false, undefined, correlationId),
        corsHeaders,
      );
    }

    // ========================================================================
    // STEP 6: Fetch Session with Tenant Info
    // ========================================================================
    log.setStep("validation_checked");
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
        tenants:target_tenant_id (slug, name, is_active)
      `)
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

    // ========================================================================
    // STEP 7: Ownership Verification
    // BY DESIGN: Only session owner can validate their own session
    // ========================================================================
    if (session.superadmin_user_id !== user.id) {
      log.warn("Attempted to validate session owned by another user", { impersonationId, owner: session.superadmin_user_id });
      return forbiddenResponse(corsHeaders, "impersonation.not_owner", undefined, correlationId);
    }

    // ========================================================================
    // STEP 8: Check if Already Ended
    // ========================================================================
    if (session.ended_at !== null || session.status !== 'ACTIVE') {
      log.info("Session already ended", { status: session.status });
      return okResponse({
        valid: false,
        status: session.status,
      }, corsHeaders, correlationId);
    }

    // ========================================================================
    // STEP 9: Expiration Check and Auto-Expire
    // INTENTIONAL: Automatic expiration on validation
    // ========================================================================
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

      // REQUIRED: Log expiration for audit trail
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
          source: "impersonation_flow",
        },
      });

      log.info("Session auto-expired", { impersonationId });

      return okResponse({
        valid: false,
        status: 'EXPIRED',
      }, corsHeaders, correlationId);
    }

    // ========================================================================
    // STEP 10: Tenant Active Check
    // INTENTIONAL: Invalidate session if tenant became inactive
    // ========================================================================
    // deno-lint-ignore no-explicit-any
    const tenantData = session.tenants as any;

    if (tenantData && !tenantData.is_active) {
      log.warn("Target tenant is no longer active", { targetTenantId: session.target_tenant_id });
      return okResponse({
        valid: false,
        status: 'TENANT_INACTIVE',
      }, corsHeaders, correlationId);
    }

    // ========================================================================
    // STEP 11: Valid Session Response
    // ========================================================================
    const remainingMs = expiresAt.getTime() - now.getTime();
    const remainingMinutes = Math.floor(remainingMs / 60000);
    
    log.info("Session validated successfully", { impersonationId, remainingMinutes });

    return okResponse({
      valid: true,
      targetTenantId: session.target_tenant_id,
      targetTenantSlug: tenantData?.slug || undefined,
      targetTenantName: tenantData?.name || undefined,
      expiresAt: session.expires_at,
      status: 'ACTIVE',
      remainingMinutes,
    }, corsHeaders, correlationId);

  } catch (err) {
    log.error("Unhandled exception", err);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
      corsHeaders,
    );
  }
});
