/**
 * @contract complete-tenant-onboarding
 * 
 * SAFE GOLD — PI-D6.2.2 + PI-GOV-001: Tenant Activation (SETUP → ACTIVE)
 * 
 * INPUT:
 *   - tenantId: UUID (required)
 *   - impersonationId: UUID (optional, for superadmin)
 * 
 * PRECONDITIONS:
 *   - tenant.status === 'SETUP'
 *   - tenant.onboarding_completed === false
 *   - tenant has at least 1 sport_type configured
 *   - tenant has at least 1 academy
 *   - tenant has at least 1 grading_scheme
 *   - requester has ADMIN_TENANT or STAFF_ORGANIZACAO role
 *   - if superadmin, valid impersonation required
 * 
 * POSTCONDITIONS:
 *   - tenant.lifecycle_status = 'ACTIVE' (via gatekeeper RPC)
 *   - tenant.status = 'ACTIVE' (via gatekeeper RPC)
 *   - tenant.onboarding_completed = true (via gatekeeper RPC)
 *   - tenant_billing row created with status = 'TRIALING'
 *   - audit events: TENANT_ONBOARDING_COMPLETED, TENANT_TRIAL_STARTED
 *   - gatekeeper creates: TENANT_LIFECYCLE_STATE_CHANGED
 * 
 * GOVERNANCE (PI-GOV-001):
 *   - Lifecycle mutation ONLY via change_tenant_lifecycle_state() RPC
 *   - ZERO direct .update() on lifecycle_status, status, or onboarding_* columns
 *   - Billing record created BEFORE activation (reversed order for safe rollback)
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
  logRateLimitBlock,
  logPermissionDenied,
  logImpersonationBlock,
} from "../_shared/decision-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-impersonation-id",
};

interface CompleteOnboardingRequest {
  tenantId: string;
  impersonationId?: string;
}

interface ActivationStatus {
  currentStatus: string;
  onboardingCompleted: boolean;
  hasSportTypes: boolean;
  hasAcademy: boolean;
  hasGradingScheme: boolean;
  sportTypesCount: number;
  academyCount: number;
  gradingSchemeCount: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("complete-tenant-onboarding", correlationId);

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

    log.info("User authenticated", { userId: user.id });

    // ========================================================================
    // RATE LIMITING (before any business logic)
    // ========================================================================
    const rateLimiter = SecureRateLimitPresets.completeOnboarding();
    const rateLimitCtx = buildRateLimitContext(req, user.id, null);
    const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabase);

    if (!rateLimitResult.allowed) {
      log.info("Rate limit exceeded", { count: rateLimitResult.count });
      
      await logRateLimitBlock(supabase, {
        operation: 'complete-tenant-onboarding',
        user_id: user.id,
        tenant_id: null,
        ip_address: req.headers.get("x-forwarded-for") || "unknown",
        count: rateLimitResult.count,
      });
      
      return rateLimiter.tooManyRequestsResponse(rateLimitResult, corsHeaders);
    }

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
      log.info("Impersonation validation failed", { error: impersonationCheck.error });
      
      await logImpersonationBlock(supabase, {
        operation: 'complete-tenant-onboarding',
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
        log.info("Role check failed", { error: roleCheck.error });
        
        await logPermissionDenied(supabase, {
          operation: 'complete-tenant-onboarding',
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
    // FETCH CURRENT TENANT STATE
    // ========================================================================
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, status, lifecycle_status, onboarding_completed, sport_types, name")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      log.info("Tenant not found", { error: tenantError?.message });
      return new Response(
        JSON.stringify({ ok: false, error: "Tenant not found", code: "NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // CHECK ALL ACTIVATION PREREQUISITES
    // ========================================================================
    const [academyResult, gradingResult] = await Promise.all([
      supabase.from("academies").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
      supabase.from("grading_schemes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
    ]);

    const sportTypesArray = tenant.sport_types || [];
    const activationStatus: ActivationStatus = {
      currentStatus: tenant.lifecycle_status || tenant.status,
      onboardingCompleted: tenant.onboarding_completed,
      hasSportTypes: sportTypesArray.length > 0,
      hasAcademy: (academyResult.count ?? 0) >= 1,
      hasGradingScheme: (gradingResult.count ?? 0) >= 1,
      sportTypesCount: sportTypesArray.length,
      academyCount: academyResult.count ?? 0,
      gradingSchemeCount: gradingResult.count ?? 0,
    };

    log.info("Activation status checked", { ...activationStatus });

    // ========================================================================
    // VALIDATE ACTIVATION CONTRACT (HARD STOPS)
    // ========================================================================
    const currentState = tenant.lifecycle_status || tenant.status;

    // 1. Status must be SETUP
    if (currentState !== "SETUP") {
      // Idempotent: if already ACTIVE, return success
      if (currentState === "ACTIVE" && tenant.onboarding_completed) {
        log.info("Already activated (idempotent)", { status: currentState });
        return new Response(
          JSON.stringify({ 
            ok: true, 
            message: "Tenant already active",
            status: activationStatus,
            alreadyActive: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "Tenant must be in SETUP status to complete onboarding",
          code: "INVALID_STATUS",
          currentStatus: currentState,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. onboarding_completed must be false
    if (tenant.onboarding_completed === true) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "Onboarding already marked as complete",
          code: "ALREADY_COMPLETED",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Collect all missing requirements
    const missingRequirements: string[] = [];
    if (!activationStatus.hasSportTypes) missingRequirements.push("sport_types");
    if (!activationStatus.hasAcademy) missingRequirements.push("academy");
    if (!activationStatus.hasGradingScheme) missingRequirements.push("grading_scheme");

    if (missingRequirements.length > 0) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: `Missing activation requirements: ${missingRequirements.join(", ")}`,
          code: "REQUIREMENTS_NOT_MET",
          status: activationStatus,
          missingRequirements,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // P3.2.2 — BILLING BOOTSTRAP (BEFORE ACTIVATION per PI-GOV-001)
    // ========================================================================
    const TRIAL_PERIOD_DAYS = 7;
    const now = new Date();
    const trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + TRIAL_PERIOD_DAYS);

    const { error: billingError } = await supabase
      .from("tenant_billing")
      .insert({
        tenant_id: tenantId,
        status: "TRIALING",
        trial_started_at: now.toISOString(),
        trial_expires_at: trialExpiresAt.toISOString(),
        plan_name: "Growth Trial",
      });

    if (billingError) {
      log.info("Billing bootstrap failed", { error: billingError.message });

      await supabase.from("audit_logs").insert({
        event_type: "TENANT_TRIAL_INIT_FAILED",
        tenant_id: tenantId,
        profile_id: user.id,
        metadata: {
          error: billingError.message,
          source: "complete-tenant-onboarding",
          attempted_status: "TRIALING",
        },
      });

      return new Response(
        JSON.stringify({
          ok: false,
          error: "Failed to initialize billing",
          code: "BILLING_INIT_FAILED",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("Billing bootstrapped", {
      tenant_id: tenantId,
      status: "TRIALING",
      trial_expires_at: trialExpiresAt.toISOString(),
    });

    // ========================================================================
    // PI-GOV-001: ACTIVATE VIA GATEKEEPER RPC (SETUP → ACTIVE)
    // The gatekeeper handles:
    //   - lifecycle_status = 'ACTIVE'
    //   - status = 'ACTIVE'
    //   - onboarding_completed = true
    //   - onboarding_completed_at = now()
    //   - onboarding_completed_by = auth.uid()
    //   - Mandatory audit log (TENANT_LIFECYCLE_STATE_CHANGED)
    //   - Cross-validation (ADMIN_TENANT + billing)
    // ========================================================================
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc("change_tenant_lifecycle_state", {
        p_tenant_id: tenantId,
        p_new_state: "ACTIVE",
        p_reason: "onboarding_completed",
      });

    if (rpcError) {
      log.info("Gatekeeper RPC failed, rolling back billing", { error: rpcError.message });

      // ROLLBACK: Delete billing record if activation fails
      await supabase
        .from("tenant_billing")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("status", "TRIALING");

      return new Response(
        JSON.stringify({
          ok: false,
          error: `Failed to activate tenant: ${rpcError.message}`,
          code: "ACTIVATION_FAILED",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("Tenant activated via gatekeeper", { 
      tenant_id: tenantId,
      previous_status: "SETUP",
      new_status: rpcResult,
    });

    // ========================================================================
    // ADDITIONAL AUDIT LOGS (domain-specific, separate from governance audit)
    // ========================================================================
    await supabase.from("audit_logs").insert([
      {
        event_type: "TENANT_ONBOARDING_COMPLETED",
        tenant_id: tenantId,
        profile_id: user.id,
        metadata: {
          completed_by: user.id,
          completed_at: now.toISOString(),
          previous_status: "SETUP",
          new_status: "ACTIVE",
          activation_status: activationStatus,
          impersonation_id: impersonationCheck.impersonationId || null,
        },
      },
      {
        event_type: "TENANT_TRIAL_STARTED",
        tenant_id: tenantId,
        profile_id: user.id,
        metadata: {
          trial_started_at: now.toISOString(),
          trial_expires_at: trialExpiresAt.toISOString(),
          trial_days: TRIAL_PERIOD_DAYS,
          source: "complete-tenant-onboarding",
        },
      },
    ]);

    log.info("Audit logs created");

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Tenant activated successfully",
        status: {
          ...activationStatus,
          currentStatus: "ACTIVE",
          onboardingCompleted: true,
        },
        billing: {
          status: "TRIALING",
          trialStartedAt: now.toISOString(),
          trialExpiresAt: trialExpiresAt.toISOString(),
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log.info("Unexpected error", { error: String(error) });
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
