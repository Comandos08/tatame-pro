/**
 * 🔐 complete-tenant-onboarding — Mark Tenant Onboarding as Complete
 * 
 * SECURITY:
 * - Requires ADMIN_TENANT or STAFF_ORGANIZACAO role
 * - If superadmin, requires valid impersonation
 * - Validates minimum requirements before marking complete
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
  console.log(`[COMPLETE-ONBOARDING] ${step}${detailsStr}`);
};

interface CompleteOnboardingRequest {
  tenantId: string;
  impersonationId?: string;
}

interface OnboardingStatus {
  hasAcademy: boolean;
  hasCoach: boolean;
  hasGradingScheme: boolean;
  academyCount: number;
  coachCount: number;
  gradingSchemeCount: number;
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
    const body: CompleteOnboardingRequest = await req.json();
    const { tenantId } = body;

    if (!tenantId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing tenantId", code: "BAD_REQUEST" }),
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
    // CHECK MINIMUM REQUIREMENTS
    // ========================================================================
    const [academyResult, coachResult, gradingResult] = await Promise.all([
      supabase.from("academies").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
      supabase.from("coaches").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
      supabase.from("grading_schemes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
    ]);

    const onboardingStatus: OnboardingStatus = {
      hasAcademy: (academyResult.count ?? 0) >= 1,
      hasCoach: (coachResult.count ?? 0) >= 1,
      hasGradingScheme: (gradingResult.count ?? 0) >= 1,
      academyCount: academyResult.count ?? 0,
      coachCount: coachResult.count ?? 0,
      gradingSchemeCount: gradingResult.count ?? 0,
    };

    logStep("Onboarding status checked", { ...onboardingStatus });

    // Validate minimum requirements
    const missingRequirements: string[] = [];
    if (!onboardingStatus.hasAcademy) missingRequirements.push("academy");
    if (!onboardingStatus.hasGradingScheme) missingRequirements.push("grading_scheme");
    // Coach is optional per requirements

    if (missingRequirements.length > 0) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: `Missing minimum requirements: ${missingRequirements.join(", ")}`,
          code: "VALIDATION_FAILED",
          status: onboardingStatus,
          missingRequirements,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // MARK ONBOARDING COMPLETE
    // ========================================================================
    const { error: updateError } = await supabase
      .from("tenants")
      .update({
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
        onboarding_completed_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    if (updateError) {
      logStep("Update failed", { error: updateError.message });
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to update tenant", code: "INTERNAL_ERROR" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Tenant onboarding marked complete");

    // ========================================================================
    // AUDIT LOG
    // ========================================================================
    await supabase.from("audit_logs").insert({
      event_type: "TENANT_ONBOARDING_COMPLETED",
      tenant_id: tenantId,
      profile_id: user.id,
      metadata: {
        completed_by: user.id,
        completed_at: new Date().toISOString(),
        status: onboardingStatus,
        impersonation_id: impersonationCheck.impersonationId || null,
      },
    });

    logStep("Audit log created");

    return new Response(
      JSON.stringify({ 
        ok: true, 
        message: "Onboarding completed successfully",
        status: onboardingStatus,
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
