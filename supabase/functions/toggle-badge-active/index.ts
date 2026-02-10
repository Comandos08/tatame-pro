/**
 * 🏅 toggle-badge-active — Activate or deactivate a badge
 *
 * SECURITY:
 * - Requires ADMIN_TENANT (or SUPERADMIN_GLOBAL)
 * - Validates badge belongs to tenant
 * - Deactivating does NOT revoke existing assignments
 * - Writes via service_role only
 * - Audit logged: BADGE_ACTIVATED / BADGE_DEACTIVATED
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
import { createAuditLog } from "../_shared/audit-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) return unauthorizedResponse("Invalid token");

    // 2. Parse input
    const { badgeId, isActive } = await req.json();

    if (!badgeId || typeof isActive !== "boolean") {
      return new Response(
        JSON.stringify({ ok: false, error: "badgeId and isActive (boolean) are required", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch badge
    const { data: badge, error: badgeError } = await supabase
      .from("badges")
      .select("id, code, tenant_id, is_active")
      .eq("id", badgeId)
      .maybeSingle();

    if (badgeError || !badge) {
      return new Response(
        JSON.stringify({ ok: false, error: "Badge not found", code: "NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Role check
    const roleCheck = await requireTenantRole(supabase, authHeader, badge.tenant_id, ["ADMIN_TENANT"]);
    if (!roleCheck.allowed) return forbiddenResponse(roleCheck.error || "Forbidden");

    // 5. Idempotent — same state → no-op
    if (badge.is_active === isActive) {
      return new Response(
        JSON.stringify({ ok: true, action: "NOOP", badgeCode: badge.code }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Update
    const { error: updateError } = await supabase
      .from("badges")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", badgeId);

    if (updateError) throw updateError;

    const eventType = isActive ? "BADGE_ACTIVATED" : "BADGE_DEACTIVATED";

    // 7. Audit (B3 — via canonical helper)
    await createAuditLog(supabase, {
      event_type: eventType,
      tenant_id: badge.tenant_id,
      profile_id: user.id,
      metadata: {
        target_type: 'BADGE',
        target_id: badgeId,
        badgeCode: badge.code,
        isActive,
      },
    });

    return new Response(
      JSON.stringify({ ok: true, action: eventType, badgeCode: badge.code }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[TOGGLE-BADGE-ACTIVE] Error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
