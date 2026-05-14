/**
 * 🔐 admin-reset-password — Hardened Password Reset for Support
 * 
 * SECURITY CONTROLS:
 * ✅ Authentication: Requires valid JWT
 * ✅ Authorization: SUPERADMIN_GLOBAL only
 * ✅ Impersonation: Active session REQUIRED
 * ✅ Rate Limiting: 5/hour fail-closed
 * ✅ Decision Logging: All outcomes logged
 * ✅ Anti-enumeration: Generic responses only
 * 
 * This endpoint allows superadmins to reset user passwords during
 * active impersonation sessions for support purposes.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireGlobalSuperadmin } from "../_shared/requireTenantRole.ts";
import { 
  requireImpersonationIfSuperadmin, 
  extractImpersonationId 
} from "../_shared/requireImpersonationIfSuperadmin.ts";
import { 
  SecureRateLimiter, 
  buildRateLimitContext 
} from "../_shared/secure-rate-limiter.ts";
import { 
  logDecision, 
  logPermissionDenied, 
  logImpersonationBlock, 
  logRateLimitBlock,
  DECISION_TYPES 
} from "../_shared/decision-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import { assertTenantAccess, TenantBoundaryError } from "../_shared/tenant-boundary.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";


// UUID regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rate limiter: 5 per hour per superadmin (stricter than default)
const rateLimiter = new SecureRateLimiter({
  operation: "admin-reset-password",
  limit: 5,
  windowSeconds: 3600,
  failClosed: true,
  logSecurityEvent: true,
});

// Generic error response (anti-enumeration). corsHeaders is taken as a
// parameter because `dynamicCors` is built per-request inside the serve()
// callback and is not in scope at module level.
function genericErrorResponse(corsHeaders: Record<string, string>, correlationId?: string): Response {
  return errorResponse(
    403,
    buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.forbidden", false, ["operation not permitted"], correlationId),
    corsHeaders,
  );
}

// Generic success response
function successResponse(corsHeaders: Record<string, string>, correlationId?: string): Response {
  return okResponse({ message: "Password reset executed" }, corsHeaders, correlationId);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("admin-reset-password", correlationId);

  // Only allow POST
  if (req.method !== "POST") {
    return errorResponse(
      405,
      buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.method_not_allowed", false, [`method ${req.method} not allowed`], correlationId),
      dynamicCors,
    );
  }

  // Initialize Supabase Admin client
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const authHeader = req.headers.get("Authorization");

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: AUTHENTICATION — Require valid JWT
  // ═══════════════════════════════════════════════════════════════
  if (!authHeader?.startsWith("Bearer ")) {
    log.warn("No auth header");
    return errorResponse(
      401,
      buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.missing_token", false, undefined, correlationId),
      dynamicCors,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: AUTHORIZATION — Require SUPERADMIN_GLOBAL
  // ═══════════════════════════════════════════════════════════════
  const roleCheck = await requireGlobalSuperadmin(supabaseAdmin, authHeader);

  if (!roleCheck.allowed || !roleCheck.userId) {
    log.warn("Not a superadmin", { error: roleCheck.error });
    
    // Log permission denied
    await logPermissionDenied(supabaseAdmin, {
      operation: "admin-reset-password",
      user_id: roleCheck.userId,
      required_roles: ["SUPERADMIN_GLOBAL"],
      reason: "INSUFFICIENT_PERMISSIONS",
    });

    return genericErrorResponse(dynamicCors, correlationId);
  }

  const superadminUserId = roleCheck.userId;

  // Parse body early for impersonation ID extraction
  let body: { userId?: string; newPassword?: string; impersonationId?: string };
  try {
    body = await req.json();
  } catch {
    log.warn("Invalid JSON body");
    
    await logDecision(supabaseAdmin, {
      decision_type: DECISION_TYPES.VALIDATION_FAILURE,
      severity: "LOW",
      operation: "admin-reset-password",
      user_id: superadminUserId,
      reason_code: "INVALID_JSON",
      metadata: { error: "Could not parse request body" },
    });

    return errorResponse(
      422,
      buildErrorEnvelope(ERROR_CODES.MALFORMED_JSON, "validation.invalid_json", false, ["could not parse request body"], correlationId),
      dynamicCors,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: IMPERSONATION — Require active session
  // ═══════════════════════════════════════════════════════════════
  const impersonationId = extractImpersonationId(req, body);

  // Get target tenant from impersonation (we need a tenant context)
  // For password reset, we need to validate the impersonation exists
  if (!impersonationId) {
    log.warn("Superadmin without impersonation ID");
    
    await logImpersonationBlock(supabaseAdmin, {
      operation: "admin-reset-password",
      user_id: superadminUserId,
      reason: "MISSING_IMPERSONATION",
    });

    return genericErrorResponse(dynamicCors, correlationId);
  }

  // Fetch and validate impersonation session
  const { data: impersonation, error: impError } = await supabaseAdmin
    .from("superadmin_impersonations")
    .select("id, target_tenant_id, status, expires_at, superadmin_user_id")
    .eq("id", impersonationId)
    .maybeSingle();

  if (impError || !impersonation) {
    log.warn("Invalid impersonation session", { impersonationId });
    
    await logImpersonationBlock(supabaseAdmin, {
      operation: "admin-reset-password",
      user_id: superadminUserId,
      impersonation_id: impersonationId,
      reason: "INVALID_IMPERSONATION",
    });

    return genericErrorResponse(dynamicCors, correlationId);
  }

  // Verify ownership
  if (impersonation.superadmin_user_id !== superadminUserId) {
    log.warn("Impersonation not owned by caller");
    
    await logImpersonationBlock(supabaseAdmin, {
      operation: "admin-reset-password",
      user_id: superadminUserId,
      impersonation_id: impersonationId,
      reason: "IMPERSONATION_OWNER_MISMATCH",
    });

    return genericErrorResponse(dynamicCors, correlationId);
  }

  // Verify active status
  if (impersonation.status !== "ACTIVE") {
    log.warn("Impersonation not active", { status: impersonation.status });
    
    await logImpersonationBlock(supabaseAdmin, {
      operation: "admin-reset-password",
      user_id: superadminUserId,
      tenant_id: impersonation.target_tenant_id,
      impersonation_id: impersonationId,
      reason: `IMPERSONATION_${impersonation.status}`,
    });

    return genericErrorResponse(dynamicCors, correlationId);
  }

  // Verify not expired
  if (new Date(impersonation.expires_at) <= new Date()) {
    log.warn("Impersonation expired");
    
    // Auto-expire the session
    await supabaseAdmin
      .from("superadmin_impersonations")
      .update({ status: "EXPIRED", ended_at: new Date().toISOString() })
      .eq("id", impersonationId);

    await logImpersonationBlock(supabaseAdmin, {
      operation: "admin-reset-password",
      user_id: superadminUserId,
      tenant_id: impersonation.target_tenant_id,
      impersonation_id: impersonationId,
      reason: "IMPERSONATION_EXPIRED",
    });

    return genericErrorResponse(dynamicCors, correlationId);
  }

  const targetTenantId = impersonation.target_tenant_id;

  // ═══════════════════════════════════════════════════════════════
  // STEP 3.5: TENANT BOUNDARY (A04) — block reset on inactive tenants
  // ═══════════════════════════════════════════════════════════════
  try {
    await assertTenantAccess(supabaseAdmin, superadminUserId, targetTenantId, impersonationId);
  } catch (boundaryError) {
    if (boundaryError instanceof TenantBoundaryError) {
      log.warn("Tenant boundary violation", { code: boundaryError.code, targetTenantId });
      await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.PERMISSION_DENIED,
        severity: "MEDIUM",
        operation: "admin-reset-password",
        user_id: superadminUserId,
        tenant_id: targetTenantId,
        reason_code: boundaryError.code,
      });
      return genericErrorResponse(dynamicCors, correlationId);
    }
    throw boundaryError;
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: RATE LIMITING — 5/hour fail-closed
  // ═══════════════════════════════════════════════════════════════
  const rateLimitCtx = buildRateLimitContext(req, superadminUserId, targetTenantId);
  const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabaseAdmin);

  if (!rateLimitResult.allowed) {
    log.warn("Rate limit exceeded", { count: rateLimitResult.count });
    
    await logRateLimitBlock(supabaseAdmin, {
      operation: "admin-reset-password",
      user_id: superadminUserId,
      tenant_id: targetTenantId,
      ip_address: rateLimitCtx.ipAddress,
      count: rateLimitResult.count,
      limit: 5,
    });

    return rateLimiter.tooManyRequestsResponse(rateLimitResult, dynamicCors, correlationId);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: PAYLOAD VALIDATION
  // ═══════════════════════════════════════════════════════════════
  const { userId: targetUserId, newPassword } = body;

  // Validate userId is present and valid UUID
  if (!targetUserId || typeof targetUserId !== "string" || !UUID_REGEX.test(targetUserId)) {
    log.warn("Invalid userId", { provided_type: typeof targetUserId });
    
    await logDecision(supabaseAdmin, {
      decision_type: DECISION_TYPES.VALIDATION_FAILURE,
      severity: "LOW",
      operation: "admin-reset-password",
      user_id: superadminUserId,
      tenant_id: targetTenantId,
      reason_code: "INVALID_USER_ID",
      metadata: { 
        provided_type: typeof targetUserId,
        impersonation_id: impersonationId,
      },
    });

    return errorResponse(
      422,
      buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.invalid_payload", false, ["invalid userId"], correlationId),
      dynamicCors,
    );
  }

  // Validate newPassword is present and at least 12 characters
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 12) {
    log.warn("Invalid password length", { password_length: newPassword?.length });
    
    await logDecision(supabaseAdmin, {
      decision_type: DECISION_TYPES.VALIDATION_FAILURE,
      severity: "LOW",
      operation: "admin-reset-password",
      user_id: superadminUserId,
      tenant_id: targetTenantId,
      reason_code: "INVALID_PASSWORD",
      metadata: { 
        password_length: newPassword?.length,
        min_required: 12,
        impersonation_id: impersonationId,
      },
    });

    return errorResponse(
      422,
      buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.invalid_payload", false, ["password must be at least 12 characters"], correlationId),
      dynamicCors,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 6: EXECUTE PASSWORD RESET
  // ═══════════════════════════════════════════════════════════════
  try {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUserId, 
      { password: newPassword }
    );

    if (updateError) {
      log.error("Update failed", updateError);
      
      // Log failure but don't expose details
      await logDecision(supabaseAdmin, {
        decision_type: "PASSWORD_RESET" as any,
        severity: "HIGH",
        operation: "admin-reset-password",
        user_id: superadminUserId,
        tenant_id: targetTenantId,
        reason_code: "RESET_FAILED",
        metadata: {
          target_user_id: targetUserId,
          impersonation_id: impersonationId,
          error_code: updateError.code,
        },
      });

      // Still return generic error
      return genericErrorResponse(dynamicCors, correlationId);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 7: LOG SUCCESS
    // ═══════════════════════════════════════════════════════════════
    await logDecision(supabaseAdmin, {
      decision_type: "PASSWORD_RESET" as any,
      severity: "HIGH",
      operation: "admin-reset-password",
      user_id: superadminUserId,
      tenant_id: targetTenantId,
      reason_code: "SUCCESS",
      metadata: {
        target_user_id: targetUserId,
        impersonation_id: impersonationId,
        action: "password_reset_by_superadmin",
      },
    });

    log.info("Success", {
      superadmin: superadminUserId,
      target: targetUserId,
      tenant: targetTenantId,
      impersonation: impersonationId,
    });

    return successResponse(dynamicCors, correlationId);

  } catch (error) {
    log.error("Unexpected error", error);
    
    await logDecision(supabaseAdmin, {
      decision_type: "PASSWORD_RESET" as any,
      severity: "HIGH",
      operation: "admin-reset-password",
      user_id: superadminUserId,
      tenant_id: targetTenantId,
      reason_code: "UNEXPECTED_ERROR",
      metadata: {
        target_user_id: targetUserId,
        impersonation_id: impersonationId,
        error: String(error),
      },
    });

    return genericErrorResponse(dynamicCors, correlationId);
  }
});
