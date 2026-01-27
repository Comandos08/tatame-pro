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
} from "../_shared/decision-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-impersonation-id",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[REVOKE-ROLES] ${step}${detailsStr}`);
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

    logStep("User authenticated", { userId: user.id });

    // ========================================================================
    // RATE LIMITING (before any business logic)
    // ========================================================================
    const rateLimiter = SecureRateLimitPresets.revokeRoles();
    const rateLimitCtx = buildRateLimitContext(req, user.id, null);
    const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabase);

    if (!rateLimitResult.allowed) {
      logStep("Rate limit exceeded", { count: rateLimitResult.count });
      
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
    const body: RevokeRolesRequest = await req.json();
    const { targetProfileId, tenantId, roles, reason, forceRemoveAll } = body;

    if (!targetProfileId || !tenantId || !roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing required fields: targetProfileId, tenantId, roles", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
      logStep("Impersonation validation failed", { error: impersonationCheck.error });
      
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
        logStep("Role check failed", { error: roleCheck.error });
        
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

    logStep("Permissions verified");

    // ========================================================================
    // GET CURRENT ROLES (for validation and audit)
    // ========================================================================
    const { data: currentRoles } = await supabase
      .from("user_roles")
      .select("id, role")
      .eq("user_id", targetProfileId)
      .eq("tenant_id", tenantId);

    const rolesBefore = currentRoles?.map(r => r.role) || [];
    logStep("Current roles fetched", { rolesBefore });

    // ========================================================================
    // PREVENT ORPHANING (unless forceRemoveAll)
    // ========================================================================
    const rolesAfterRevoke = rolesBefore.filter(r => !roles.includes(r));
    
    if (rolesAfterRevoke.length === 0 && !forceRemoveAll) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "Cannot remove all roles. User would become orphaned. Use forceRemoveAll if ending membership.",
          code: "VALIDATION_FAILED",
          rolesBefore,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
        logStep("Role not found, skipping", { role });
        continue;
      }

      // Delete the role
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("id", roleRecord.id);

      if (deleteError) {
        logStep("Role delete failed", { role, error: deleteError.message });
      } else {
        revokedRoles.push(role);
        logStep("Role revoked", { role });
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
      logStep("Audit log created");
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        message: `Revoked ${revokedRoles.length} role(s)`,
        revokedRoles,
        notFoundRoles,
        rolesBefore,
        rolesAfter,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    logStep("Unexpected error", { error: String(error) });
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
