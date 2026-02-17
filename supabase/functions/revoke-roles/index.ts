/**
 * 🔐 revoke-roles — Revoke Roles from Users
 * 
 * SECURITY:
 * - Requires ADMIN_TENANT or STAFF_ORGANIZACAO role
 * - If superadmin, requires valid impersonation
 * - Prevents removing last role (would leave user orphaned)
 * - Full audit logging
 * - Rate limited: 20 per hour per user
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildErrorEnvelope, errorResponse, okResponse, ERROR_CODES } from "../_shared/errors/envelope.ts";
import { requireTenantRole, forbiddenResponse, unauthorizedResponse } from "../_shared/requireTenantRole.ts";
import { 
  requireImpersonationIfSuperadmin, 
  extractImpersonationId 
} from "../_shared/requireImpersonationIfSuperadmin.ts";
import {
  SecureRateLimitPresets,
  buildRateLimitContext,
} from "../_shared/secure-rate-limiter.ts";
import {
  logSecurityEvent,
  SECURITY_EVENTS,
  extractRequestContext,
} from "../_shared/security-logger.ts";
import {
  logRateLimitBlock,
  logPermissionDenied,
  logImpersonationBlock,
  logBillingRestricted,
} from "../_shared/decision-logger.ts";
import {
  requireBillingStatus,
  billingRestrictedResponse,
} from "../_shared/requireBillingStatus.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-impersonation-id",
};

interface RevokeRolesRequest {
  targetProfileId: string;
  tenantId: string;
  roles: string[];
  reason?: string;
  impersonationId?: string;
  forceRemoveAll?: boolean; // Only if explicitly ending membership
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("revoke-roles", correlationId);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================================================
    // AUTH VALIDATION
    // ========================================================================
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return unauthorizedResponse("Missing authorization header");
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) {
      return unauthorizedResponse("Invalid token");
    }

    log.setUser(user.id);
    log.info("User authenticated");

    // ========================================================================
    // RATE LIMITING (before any business logic)
    // ========================================================================
    const rateLimiter = SecureRateLimitPresets.revokeRoles();
    const rateLimitCtx = buildRateLimitContext(req, user.id, null);
    const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabase);

    if (!rateLimitResult.allowed) {
      log.warn("Rate limit exceeded", { count: rateLimitResult.count });
      
      // Log decision BEFORE responding
      await logRateLimitBlock(supabase, {
        operation: 'revoke-roles',
        user_id: user.id,
        tenant_id: null,
        ip_address: extractRequestContext(req).ip_address,
        count: rateLimitResult.count,
      });
      
      return rateLimiter.tooManyRequestsResponse(rateLimitResult, corsHeaders);
    }
    // ========================================================================
    // PARSE INPUT
    // ========================================================================
    let body: RevokeRolesRequest;
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, buildErrorEnvelope(
        ERROR_CODES.MALFORMED_JSON, "validation.malformed_json", false, undefined, correlationId
      ), corsHeaders);
    }
    const { targetProfileId, tenantId, roles, reason, forceRemoveAll } = body;

    if (!targetProfileId || !tenantId || !roles || roles.length === 0) {
      return errorResponse(400, buildErrorEnvelope(
        ERROR_CODES.VALIDATION_ERROR, "validation.missing_fields", false,
        ["Missing required fields: targetProfileId, tenantId, roles"], correlationId
      ), corsHeaders);
    }

    log.setTenant(tenantId);

    // ========================================================================
    // IMPERSONATION CHECK (if superadmin)
    // ========================================================================
    const impersonationId = extractImpersonationId(req, body);
    const impersonationCheck = await requireImpersonationIfSuperadmin(
      supabase,
      user.id,
      tenantId,
      impersonationId
    );

    if (!impersonationCheck.valid) {
      log.warn("Impersonation validation failed", { error: impersonationCheck.error });
      
      // Log decision BEFORE responding
      await logImpersonationBlock(supabase, {
        operation: 'revoke-roles',
        user_id: user.id,
        tenant_id: tenantId,
        impersonation_id: impersonationId || undefined,
        reason: impersonationCheck.error || 'INVALID_IMPERSONATION',
      });
      
      return forbiddenResponse(impersonationCheck.error || "Forbidden");
    }

    // ========================================================================
    // ROLE CHECK (if not superadmin with valid impersonation)
    // ========================================================================
    if (!impersonationCheck.isSuperadmin) {
      const roleCheck = await requireTenantRole(
        supabase,
        authHeader,
        tenantId,
        ["ADMIN_TENANT", "STAFF_ORGANIZACAO"]
      );

      if (!roleCheck.allowed) {
        log.warn("Role check failed", { error: roleCheck.error });
        
        // Log decision BEFORE responding
        await logPermissionDenied(supabase, {
          operation: 'revoke-roles',
          user_id: user.id,
          tenant_id: tenantId,
          required_roles: ["ADMIN_TENANT", "STAFF_ORGANIZACAO"],
          reason: roleCheck.error || 'INSUFFICIENT_PERMISSIONS',
        });
        
        return forbiddenResponse(roleCheck.error || "Insufficient permissions");
      }
    }

    log.info("Permissions verified");

    // ========================================================================
    // BILLING STATUS CHECK (P1 - Block operations on restricted tenants)
    // ========================================================================
    const billingCheck = await requireBillingStatus(supabase, tenantId);
    if (!billingCheck.allowed) {
      log.warn("Billing status blocked operation", { 
        status: billingCheck.status, 
        code: billingCheck.code 
      });
      
      await logBillingRestricted(supabase, {
        operation: 'revoke-roles',
        user_id: user.id,
        tenant_id: tenantId,
        billing_status: billingCheck.status,
      });
      
      return billingRestrictedResponse(billingCheck.status);
    }

    log.info("Billing status OK", { status: billingCheck.status });

    // ========================================================================
    // GET CURRENT ROLES (for validation and audit)
    // ========================================================================
    const { data: currentRoles } = await supabase
      .from("user_roles")
      .select("id, role")
      .eq("user_id", targetProfileId)
      .eq("tenant_id", tenantId);

    const rolesBefore = currentRoles?.map(r => r.role) || [];
    log.info("Current roles fetched", { rolesBefore });

    // ========================================================================
    // PREVENT ORPHANING (unless forceRemoveAll)
    // ========================================================================
    const rolesAfterRevoke = rolesBefore.filter(r => !roles.includes(r));
    
    if (rolesAfterRevoke.length === 0 && !forceRemoveAll) {
      return errorResponse(422, buildErrorEnvelope(
        ERROR_CODES.VALIDATION_ERROR, "validation.cannot_orphan_user", false,
        ["Cannot remove all roles. User would become orphaned. Use forceRemoveAll if ending membership."], correlationId
      ), corsHeaders);
    }

    // ========================================================================
    // REVOKE ROLES
    // ========================================================================
    const revokedRoles: string[] = [];
    const notFoundRoles: string[] = [];

    for (const role of roles) {
      const roleRecord = currentRoles?.find(r => r.role === role);
      
      if (!roleRecord) {
        notFoundRoles.push(role);
        log.info("Role not found, skipping", { role });
        continue;
      }

      // Delete the role via gatekeeper RPC
      const { error: deleteError } = await supabase.rpc(
        'revoke_user_role',
        { p_user_id: targetProfileId, p_tenant_id: tenantId, p_role: role }
      ).then(res => ({ error: res.error }));

      if (deleteError) {
        log.error("Role delete failed", deleteError, { role });
      } else {
        revokedRoles.push(role);
        log.info("Role revoked", { role });
      }
    }

    const rolesAfter = rolesBefore.filter(r => !revokedRoles.includes(r));

    // ========================================================================
    // AUDIT LOG
    // ========================================================================
    if (revokedRoles.length > 0) {
      await supabase.from("audit_logs").insert({
        event_type: "ROLES_REVOKED",
        tenant_id: tenantId,
        profile_id: user.id,
        metadata: {
          target_profile_id: targetProfileId,
          roles_revoked: revokedRoles,
          roles_before: rolesBefore,
          roles_after: rolesAfter,
          reason: reason || null,
          revoked_by: user.id,
          revoked_at: new Date().toISOString(),
          force_remove_all: forceRemoveAll || false,
          impersonation_id: impersonationCheck.impersonationId || null,
        },
      });
      log.info("Audit log created");
    }

    return okResponse({ 
      message: `Revoked ${revokedRoles.length} role(s)`,
      revokedRoles,
      notFoundRoles,
      rolesBefore,
      rolesAfter,
    }, corsHeaders, correlationId);

  } catch (error) {
    log.error("Unexpected error", error);
    return errorResponse(500, buildErrorEnvelope(
      ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId
    ), corsHeaders);
  }
});
