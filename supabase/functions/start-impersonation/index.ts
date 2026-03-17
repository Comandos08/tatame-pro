/**
 * ============================================================================
 * 🔐 start-impersonation — Impersonation Session Factory
 * ============================================================================
 * 
 * IMMUTABLE CONTRACT:
 * This function creates time-limited impersonation sessions for SUPERADMIN_GLOBAL
 * users to access tenant resources with full audit trail.
 * 
 * WHAT THIS FUNCTION DOES:
 * - Validates caller is SUPERADMIN_GLOBAL (tenant_id IS NULL)
 * - Enforces rate limiting (10 sessions/hour per superadmin)
 * - Ends any existing ACTIVE sessions for the caller
 * - Creates a new session with 60-minute TTL
 * - Logs session creation to audit_logs
 * 
 * WHAT THIS FUNCTION DOES NOT DO:
 * - Does NOT grant any roles or permissions
 * - Does NOT modify tenant data
 * - Does NOT bypass RLS policies directly
 * - Does NOT allow impersonation of users (only tenants)
 * 
 * SECURITY INVARIANTS:
 * - Only SUPERADMIN_GLOBAL can start impersonation (BY DESIGN)
 * - Sessions have hard cap of 60 minutes (INTENTIONAL)
 * - Previous sessions are forcibly ended (INTENTIONAL)
 * - All sessions are immutably logged (REQUIRED)
 * - Rate limiting is fail-closed (REQUIRED)
 * 
 * A02: Institutional envelope + structured logger + correlationId
 * ============================================================================
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
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
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


// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum session duration in minutes.
 * INTENTIONAL: Hard cap to limit exposure window.
 */
const MAX_TTL_MINUTES = 60;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface StartImpersonationRequest {
  targetTenantId: string;
  reason?: string;
}

// ============================================================================
// ENTRYPOINT
// ============================================================================

Deno.serve(async (req) => {
  // --- CORS Preflight ---
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("start-impersonation", correlationId);

  try {
    // ========================================================================
    // STEP 1: Authorization Validation
    // ========================================================================
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      log.warn("Missing authorization header");
      return unauthorizedResponse(dynamicCors, "auth.missing_header", undefined, correlationId);
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
        { status: 500, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
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
      return unauthorizedResponse(dynamicCors, "auth.invalid_token", undefined, correlationId);
    }

    log.setUser(user.id);

    // ========================================================================
    // STEP 4: Rate Limiting (Role-Aware)
    // BY DESIGN: Applied BEFORE permission check to prevent enumeration
    // SUPERADMIN_GLOBAL gets elevated limit (100/hr) for debugging workflows
    // ========================================================================
    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .is('tenant_id', null)
      .eq('role', 'SUPERADMIN_GLOBAL')
      .maybeSingle();

    const isSuperadmin = !!callerRole;
    const rateLimiter = isSuperadmin
      ? SecureRateLimitPresets.startImpersonationElevated()
      : SecureRateLimitPresets.startImpersonation();
    const rateLimitCtx = buildRateLimitContext(req, user.id, null);
    const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabaseAdmin);

    log.info("[RateLimit] Role-based preset applied", {
      userId: user.id,
      isSuperadmin,
      limit: rateLimitResult.count,
      allowed: rateLimitResult.allowed,
    });

    if (!rateLimitResult.allowed) {
      log.warn("Rate limit exceeded");
      return rateLimiter.tooManyRequestsResponse(rateLimitResult, dynamicCors, correlationId);
    }

    // ========================================================================
    // STEP 5: SUPERADMIN_GLOBAL Role Verification
    // INTENTIONAL: Only global superadmins (tenant_id IS NULL) can impersonate
    // ========================================================================
    const { data: superadmin, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .is('tenant_id', null)
      .eq('role', 'SUPERADMIN_GLOBAL')
      .maybeSingle();

    if (roleError || !superadmin) {
      log.setStep("actor_validated");
      log.warn("Non-superadmin attempted impersonation");
      return forbiddenResponse(dynamicCors, "auth.superadmin_required", undefined, correlationId);
    }

    log.setStep("actor_validated");
    log.info("SUPERADMIN_GLOBAL role confirmed");

    // ========================================================================
    // STEP 6: Request Body Validation
    // ========================================================================
    const body: StartImpersonationRequest = await req.json();
    const { targetTenantId, reason } = body;

    if (!targetTenantId || typeof targetTenantId !== 'string') {
      log.warn("Missing targetTenantId");
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.target_tenant_required", false, undefined, correlationId),
        dynamicCors,
      );
    }

    log.setTenant(targetTenantId);

    // ========================================================================
    // STEP 7: Target Tenant Existence + Active Check
    // ========================================================================
    log.setStep("tenant_validated");
    const { data: targetTenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, name, slug, is_active')
      .eq('id', targetTenantId)
      .maybeSingle();

    if (tenantError || !targetTenant) {
      log.warn("Target tenant not found", { targetTenantId });
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "tenant.not_found", false, undefined, correlationId),
        dynamicCors,
      );
    }

    if (!targetTenant.is_active) {
      log.warn("Target tenant is inactive", { targetTenantId });
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.TENANT_BLOCKED, "impersonation.tenant_inactive", false, undefined, correlationId),
        dynamicCors,
      );
    }

    // ========================================================================
    // STEP 8: End Existing ACTIVE Sessions
    // INTENTIONAL: One active session per superadmin at a time
    // ========================================================================
    await supabaseAdmin
      .from('superadmin_impersonations')
      .update({ 
        status: 'ENDED', 
        ended_at: new Date().toISOString(),
        ended_by_profile_id: user.id
      })
      .eq('superadmin_user_id', user.id)
      .eq('status', 'ACTIVE');

    // ========================================================================
    // STEP 9: Create New Impersonation Session
    // ========================================================================
    const expiresAt = new Date(Date.now() + MAX_TTL_MINUTES * 60 * 1000);
    
    const { data: newSession, error: insertError } = await supabaseAdmin
      .from('superadmin_impersonations')
      .insert({
        superadmin_user_id: user.id,
        target_tenant_id: targetTenantId,
        expires_at: expiresAt.toISOString(),
        status: 'ACTIVE',
        reason: reason || null,
        metadata: {
          user_agent: req.headers.get('user-agent') || 'unknown',
          started_from: 'admin_dashboard',
        },
        created_by_profile_id: user.id,
      })
      .select('id, target_tenant_id, expires_at, status')
      .maybeSingle();

    // ======================================================================
    // A02.T2: Anti-Concurrent Lock — handle unique violation (23505)
    // If two requests race past the UPDATE, the partial unique index
    // ensures only one INSERT succeeds. The loser gets the existing session.
    // ======================================================================
    if (insertError) {
      const isUniqueViolation = (err: unknown): boolean => {
        if (!err || typeof err !== 'object') return false;
        const e = err as Record<string, unknown>;
        if (e.code === '23505') return true;
        if (typeof e.message === 'string' && e.message.includes('duplicate key value violates unique constraint')) return true;
        return false;
      };

      if (isUniqueViolation(insertError)) {
        log.warn("Concurrent active session detected; returning existing", { superadmin_user_id: user.id });

        const { data: existing, error: fetchError } = await supabaseAdmin
          .from('superadmin_impersonations')
          .select('id, target_tenant_id, expires_at, status')
          .eq('superadmin_user_id', user.id)
          .eq('status', 'ACTIVE')
          .maybeSingle();

        if (fetchError || !existing) {
          log.error("Failed to fetch existing active session after lock hit", fetchError);
          return errorResponse(
            500,
            buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "impersonation.lock_recovery_failed", true, undefined, correlationId),
            dynamicCors,
          );
        }

        // Fetch tenant info for the existing session
        const { data: existingTenant } = await supabaseAdmin
          .from('tenants')
          .select('slug, name')
          .eq('id', existing.target_tenant_id)
          .maybeSingle();

        return okResponse({
          impersonationId: existing.id,
          targetTenantId: existing.target_tenant_id,
          targetTenantSlug: existingTenant?.slug ?? '',
          targetTenantName: existingTenant?.name ?? '',
          expiresAt: existing.expires_at,
          status: 'ACTIVE',
          lock: 'CONCURRENT_ACTIVE_SESSION',
        }, dynamicCors, correlationId);
      }

      log.error("Failed to create impersonation session", insertError);
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "impersonation.create_failed", true, undefined, correlationId),
        dynamicCors,
      );
    }

    if (!newSession) {
      log.error("Insert returned no data");
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "impersonation.create_failed", true, undefined, correlationId),
        dynamicCors,
      );
    }

    // ========================================================================
    // STEP 10: Audit Logging
    // REQUIRED: Immutable record of session creation
    // ========================================================================
    await createAuditLog(supabaseAdmin, {
      event_type: 'IMPERSONATION_STARTED',
      tenant_id: targetTenantId,
      profile_id: user.id,
      metadata: {
        impersonation_id: newSession.id,
        superadmin_user_id: user.id,
        target_tenant_id: targetTenantId,
        target_tenant_name: targetTenant.name,
        target_tenant_slug: targetTenant.slug,
        expires_at: expiresAt.toISOString(),
        reason: reason || undefined,
        automatic: false,
      },
    });

    log.setStep("impersonation_started");
    log.info("Impersonation session created", { impersonationId: newSession.id });

    // ========================================================================
    // STEP 11: Success Response
    // ========================================================================
    return okResponse({
      impersonationId: newSession.id,
      targetTenantId: targetTenant.id,
      targetTenantSlug: targetTenant.slug,
      targetTenantName: targetTenant.name,
      expiresAt: expiresAt.toISOString(),
      status: 'ACTIVE',
    }, dynamicCors, correlationId);

  } catch (err) {
    log.error("Unhandled exception", err);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
      dynamicCors,
    );
  }
});
