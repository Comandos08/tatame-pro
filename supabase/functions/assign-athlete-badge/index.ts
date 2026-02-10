/**
 * 🏅 assign-athlete-badge — Grant a symbolic badge to an athlete
 *
 * SECURITY:
 * - Requires ADMIN_TENANT (or SUPERADMIN_GLOBAL)
 * - Validates athlete, badge, and tenant cross-references
 * - Writes via service_role only
 * - Idempotent: existing active badge → no-op; revoked → reactivate
 * - Audit logged
 *
 * @see docs/BADGE-CONTRACT.md
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  requireTenantRole,
  forbiddenResponse,
  unauthorizedResponse,
} from "../_shared/requireTenantRole.ts";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: Record<string, unknown>) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[ASSIGN-BADGE] ${step}${d}`);
};

interface AssignBadgeRequest {
  athleteId: string;
  badgeId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return unauthorizedResponse("Missing authorization header");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) return unauthorizedResponse("Invalid token");

    log("Authenticated", { userId: user.id });

    // 2. Parse input
    const body: AssignBadgeRequest = await req.json();
    const { athleteId, badgeId } = body;

    if (!athleteId || !badgeId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing athleteId or badgeId", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch athlete to get tenant_id
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .select("id, tenant_id")
      .eq("id", athleteId)
      .maybeSingle();

    if (athleteError || !athlete) {
      return new Response(
        JSON.stringify({ ok: false, error: "Athlete not found", code: "NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantId = athlete.tenant_id;

    // 4. Role check: ADMIN_TENANT for this tenant
    const roleCheck = await requireTenantRole(supabase, authHeader, tenantId, ["ADMIN_TENANT"]);
    if (!roleCheck.allowed) {
      log("Permission denied", { error: roleCheck.error });
      return forbiddenResponse(roleCheck.error || "Forbidden");
    }

    // 5. Validate badge belongs to same tenant
    const { data: badge, error: badgeError } = await supabase
      .from("badges")
      .select("id, code, name, tenant_id, is_active")
      .eq("id", badgeId)
      .maybeSingle();

    if (badgeError || !badge) {
      return new Response(
        JSON.stringify({ ok: false, error: "Badge not found", code: "NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (badge.tenant_id !== tenantId) {
      log("Cross-tenant badge attempt blocked");
      return forbiddenResponse("Badge does not belong to this tenant");
    }

    if (!badge.is_active) {
      return new Response(
        JSON.stringify({ ok: false, error: "Badge is inactive", code: "BADGE_INACTIVE" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Check existing assignment
    const { data: existing } = await supabase
      .from("athlete_badges")
      .select("id, revoked_at")
      .eq("athlete_id", athleteId)
      .eq("badge_id", badgeId)
      .maybeSingle();

    let action: "NOOP" | "REACTIVATED" | "GRANTED" = "NOOP";

    if (existing) {
      if (existing.revoked_at === null) {
        // Already active — no-op
        action = "NOOP";
        log("Badge already active, no-op", { athleteId, badgeCode: badge.code });
      } else {
        // Revoked — reactivate
        const { error: updateError } = await supabase
          .from("athlete_badges")
          .update({ revoked_at: null, granted_by: user.id, granted_at: new Date().toISOString() })
          .eq("id", existing.id);

        if (updateError) throw updateError;
        action = "REACTIVATED";
        log("Badge reactivated", { athleteId, badgeCode: badge.code });
      }
    } else {
      // New assignment
      const { error: insertError } = await supabase.from("athlete_badges").insert({
        athlete_id: athleteId,
        badge_id: badgeId,
        tenant_id: tenantId,
        granted_by: user.id,
      });

      if (insertError) throw insertError;
      action = "GRANTED";
      log("Badge granted", { athleteId, badgeCode: badge.code });
    }

    // 7. Audit log (B3 — via canonical helper)
    if (action !== "NOOP") {
      await createAuditLog(supabase, {
        event_type: AUDIT_EVENTS.BADGE_GRANTED,
        tenant_id: tenantId,
        profile_id: user.id,
        metadata: {
          target_type: 'ATHLETE',
          target_id: athleteId,
          badgeCode: badge.code,
          badgeName: badge.name,
          action,
        },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, action, badgeCode: badge.code }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log("Unexpected error", { error: String(error) });
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
