/**
 * 🏅 revoke-athlete-badge — Soft-revoke a badge from an athlete
 *
 * SECURITY:
 * - Requires ADMIN_TENANT (or SUPERADMIN_GLOBAL)
 * - Validates athlete, badge, and tenant cross-references
 * - Writes via service_role only
 * - Idempotent: already revoked → no-op
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: Record<string, unknown>) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[REVOKE-BADGE] ${step}${d}`);
};

interface RevokeBadgeRequest {
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
    const body: RevokeBadgeRequest = await req.json();
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

    // 4. Role check
    const roleCheck = await requireTenantRole(supabase, authHeader, tenantId, ["ADMIN_TENANT"]);
    if (!roleCheck.allowed) {
      log("Permission denied", { error: roleCheck.error });
      return forbiddenResponse(roleCheck.error || "Forbidden");
    }

    // 5. Find active assignment
    const { data: existing } = await supabase
      .from("athlete_badges")
      .select("id, revoked_at, badges(code, name)")
      .eq("athlete_id", athleteId)
      .eq("badge_id", badgeId)
      .maybeSingle();

    if (!existing) {
      return new Response(
        JSON.stringify({ ok: true, action: "NOOP", reason: "No assignment found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existing.revoked_at !== null) {
      log("Already revoked, no-op");
      return new Response(
        JSON.stringify({ ok: true, action: "NOOP", reason: "Already revoked" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Soft revoke
    const { error: updateError } = await supabase
      .from("athlete_badges")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (updateError) throw updateError;

    const badgeInfo = existing.badges as any;
    log("Badge revoked", { athleteId, badgeCode: badgeInfo?.code });

    // 7. Audit log
    await supabase.from("audit_logs").insert({
      event_type: "BADGE_REVOKED",
      tenant_id: tenantId,
      profile_id: user.id,
      metadata: {
        athleteId,
        badgeCode: badgeInfo?.code,
        badgeName: badgeInfo?.name,
        performedBy: user.id,
      },
    });

    return new Response(
      JSON.stringify({ ok: true, action: "REVOKED", badgeCode: badgeInfo?.code }),
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
