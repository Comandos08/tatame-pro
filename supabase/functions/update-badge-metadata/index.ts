// ============= Full file contents =============

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  requireTenantRole,
  forbiddenResponse,
  unauthorizedResponse,
} from "../_shared/requireTenantRole.ts";
import { createAuditLog } from "../_shared/audit-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("update-badge-metadata", correlationId);

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
    const { badgeId, name, description } = await req.json();

    if (!badgeId || !name || typeof name !== "string" || name.trim().length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "badgeId and non-empty name are required", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch badge
    const { data: badge, error: badgeError } = await supabase
      .from("badges")
      .select("id, code, name, description, tenant_id")
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

    // 5. Update
    const { error: updateError } = await supabase
      .from("badges")
      .update({
        name: name.trim(),
        description: description === undefined ? badge.description : (description || null),
        updated_at: new Date().toISOString(),
      })
      .eq("id", badgeId);

    if (updateError) throw updateError;

    // 6. Audit (B3 — via canonical helper)
    await createAuditLog(supabase, {
      event_type: 'BADGE_METADATA_UPDATED',
      tenant_id: badge.tenant_id,
      profile_id: user.id,
      metadata: {
        target_type: 'BADGE',
        target_id: badgeId,
        badgeCode: badge.code,
        changes: {
          name: { from: badge.name, to: name.trim() },
          description: { from: badge.description, to: description ?? badge.description },
        },
      },
    });

    return new Response(
      JSON.stringify({ ok: true, badgeCode: badge.code }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log.error("[UPDATE-BADGE-METADATA] Error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
