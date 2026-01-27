/**
 * 🔐 grant-roles — Grant Roles to Users
 * 
 * SECURITY:
 * - Requires ADMIN_TENANT or STAFF_ORGANIZACAO role
 * - If superadmin, requires valid impersonation
 * - Idempotent: won't create duplicate roles
 * - Full audit logging
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireTenantRole, forbiddenResponse, unauthorizedResponse } from "../_shared/requireTenantRole.ts";
import { 
  requireImpersonationIfSuperadmin, 
  extractImpersonationId 
} from "../_shared/requireImpersonationIfSuperadmin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-impersonation-id",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[GRANT-ROLES] ${step}${detailsStr}`);
};

// Valid roles that can be granted
const VALID_ROLES = [
  'ATLETA',
  'COACH_ASSISTENTE', 
  'COACH_PRINCIPAL',
  'INSTRUTOR',
  'STAFF_ORGANIZACAO',
  'ADMIN_TENANT',
  'RECEPCAO',
] as const;

type ValidRole = typeof VALID_ROLES[number];

interface GrantRolesRequest {
  targetProfileId: string;
  tenantId: string;
  roles: string[];
  reason?: string;
  impersonationId?: string;
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
    // PARSE INPUT
    // ========================================================================
    const body: GrantRolesRequest = await req.json();
    const { targetProfileId, tenantId, roles, reason } = body;

    if (!targetProfileId || !tenantId || !roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing required fields: targetProfileId, tenantId, roles", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate roles
    const validatedRoles: ValidRole[] = [];
    for (const role of roles) {
      if (VALID_ROLES.includes(role as ValidRole)) {
        validatedRoles.push(role as ValidRole);
      } else {
        logStep("Invalid role rejected", { role });
      }
    }

    if (validatedRoles.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "No valid roles provided", code: "BAD_REQUEST" }),
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
        return forbiddenResponse(roleCheck.error || "Insufficient permissions");
      }
    }

    logStep("Permissions verified");

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
