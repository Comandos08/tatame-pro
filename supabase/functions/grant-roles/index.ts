/**
 * 🔐 grant-roles — Grant Roles to Users
 * 
 * SECURITY:
 * - Requires ADMIN_TENANT or STAFF_ORGANIZACAO role
 * - If superadmin, requires valid impersonation
 * - Idempotent: won't create duplicate roles
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
  logBillingRestricted,
} from "../_shared/decision-logger.ts";
import {
  requireBillingStatus,
  billingRestrictedResponse,
} from "../_shared/requireBillingStatus.ts";
import {
  parseRequestBody,
  validateInput,
  validationErrorResponse,
} from "../_shared/validation/validate.ts";
import {
  GrantRolesSchema,
  type ValidRole,
} from "../_shared/validation/schemas/grant-roles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-impersonation-id",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[GRANT-ROLES] ${step}${detailsStr}`);
};


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
    const rateLimiter = SecureRateLimitPresets.grantRoles();
    const rateLimitCtx = buildRateLimitContext(req, user.id, null);
    const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabase);

    if (!rateLimitResult.allowed) {
      logStep("Rate limit exceeded", { count: rateLimitResult.count });
      
      // Log decision BEFORE responding
      await logRateLimitBlock(supabase, {
        operation: 'grant-roles',
        user_id: user.id,
        tenant_id: null,
        ip_address: extractRequestContext(req).ip_address,
        count: rateLimitResult.count,
      });
      
      return rateLimiter.tooManyRequestsResponse(rateLimitResult, corsHeaders);
    }

    // ========================================================================
    // PARSE & VALIDATE INPUT (PI-A05 — Institutional Validation Layer)
    // ========================================================================
    const bodyResult = await parseRequestBody(req, corsHeaders);
    if (!bodyResult.success) return bodyResult.response;

    const parsed = validateInput(GrantRolesSchema, bodyResult.data);
    if (!parsed.success) return validationErrorResponse(parsed.error, corsHeaders);

    const { targetProfileId, tenantId, roles, reason } = parsed.data;
    const validatedRoles: ValidRole[] = [...roles];

    // ========================================================================
    // IMPERSONATION CHECK (if superadmin)
    // ========================================================================
    const impersonationId = extractImpersonationId(req, parsed.data);
    const impersonationCheck = await requireImpersonationIfSuperadmin(
      supabase,
      user.id,
      tenantId,
      impersonationId
    );

    if (!impersonationCheck.valid) {
      logStep("Impersonation validation failed", { error: impersonationCheck.error });
      
      // Log security event for invalid impersonation attempt
      const { ip_address, user_agent } = extractRequestContext(req);
      await logSecurityEvent(supabase, {
        event_type: SECURITY_EVENTS.IMPERSONATION_INVALID,
        severity: 'HIGH',
        user_id: user.id,
        tenant_id: tenantId,
        ip_address,
        user_agent,
        operation: 'grant-roles',
        metadata: { error: impersonationCheck.error },
      });
      
      // Log decision BEFORE responding
      await logImpersonationBlock(supabase, {
        operation: 'grant-roles',
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
        
        // Log permission denied decision BEFORE responding
        await logPermissionDenied(supabase, {
          operation: 'grant-roles',
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
    // BILLING STATUS CHECK (P1 - Block operations on restricted tenants)
    // ========================================================================
    const billingCheck = await requireBillingStatus(supabase, tenantId);
    if (!billingCheck.allowed) {
      logStep("Billing status blocked operation", { 
        status: billingCheck.status, 
        code: billingCheck.code 
      });
      
      await logBillingRestricted(supabase, {
        operation: 'grant-roles',
        user_id: user.id,
        tenant_id: tenantId,
        billing_status: billingCheck.status,
      });
      
      return billingRestrictedResponse(billingCheck.status);
    }

    logStep("Billing status OK", { status: billingCheck.status });

    // ========================================================================
    // GET CURRENT ROLES (for audit)
    // ========================================================================
    const { data: currentRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", targetProfileId)
      .eq("tenant_id", tenantId);

    const rolesBefore = currentRoles?.map(r => r.role) || [];
    logStep("Current roles fetched", { rolesBefore });

    // ========================================================================
    // GRANT ROLES (idempotent)
    // ========================================================================
    const grantedRoles: string[] = [];
    const skippedRoles: string[] = [];

    for (const role of validatedRoles) {
      // Check if role already exists
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", targetProfileId)
        .eq("tenant_id", tenantId)
        .eq("role", role)
        .maybeSingle();

      if (existingRole) {
        skippedRoles.push(role);
        logStep("Role already exists, skipping", { role });
        continue;
      }

      // Insert new role
      const { error: insertError } = await supabase
        .from("user_roles")
        .insert({
          user_id: targetProfileId,
          tenant_id: tenantId,
          role: role,
        });

      if (insertError) {
        logStep("Role insert failed", { role, error: insertError.message });
      } else {
        grantedRoles.push(role);
        logStep("Role granted", { role });
      }
    }

    const rolesAfter = [...new Set([...rolesBefore, ...grantedRoles])];

    // ========================================================================
    // AUDIT LOG
    // ========================================================================
    if (grantedRoles.length > 0) {
      await supabase.from("audit_logs").insert({
        event_type: "ROLES_GRANTED",
        tenant_id: tenantId,
        profile_id: user.id,
        metadata: {
          target_profile_id: targetProfileId,
          roles_granted: grantedRoles,
          roles_before: rolesBefore,
          roles_after: rolesAfter,
          reason: reason || null,
          granted_by: user.id,
          granted_at: new Date().toISOString(),
          impersonation_id: impersonationCheck.impersonationId || null,
        },
      });
      logStep("Audit log created");
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        message: `Granted ${grantedRoles.length} role(s)`,
        grantedRoles,
        skippedRoles,
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
