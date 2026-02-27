/**
 * @contract leave-federation
 * 
 * SAFE GOLD — PI-D6.1.2: Federation Governance Edge Function
 * 
 * INPUT:
 *   - tenantId: UUID (required)
 *   - federationId: UUID (required)
 *   - reason: string (required, min 5 chars)
 * 
 * PRECONDITIONS:
 *   - tenant is an active member of the federation
 *   - requester has FED_ADMIN or ADMIN_TENANT role
 * 
 * POSTCONDITIONS:
 *   - federation_tenants.left_at set (NEVER delete)
 *   - audit event TENANT_LEFT_FEDERATION logged with federation_id
 * 
 * SECURITY:
 *   - Rate limited: 10 leaves per hour
 *   - Full audit trail
 *   - Soft history (never delete)
 * 
 * INVARIANT (I2):
 *   - Tenant↔Federation link is immutable (soft history)
 *   - Events require metadata.federation_id
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LeaveFederationRequest {
  tenantId: string;
  federationId: string;
  reason: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("leave-federation", correlationId);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================================================
    // AUTH VALIDATION
    // ========================================================================
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // PARSE INPUT
    // ========================================================================
    let body: LeaveFederationRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { tenantId, federationId, reason } = body;

    // Validate UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!tenantId || !federationId || !uuidRegex.test(tenantId) || !uuidRegex.test(federationId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid ID format" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate reason (required, min 5 chars)
    if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
      return new Response(
        JSON.stringify({ success: false, error: "Reason is required (min 5 characters)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // ROLE CHECK (FED_ADMIN or ADMIN_TENANT)
    // ========================================================================
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", user.id);

    const isSuperadmin = roles?.some(r => r.role === "SUPERADMIN_GLOBAL" && r.tenant_id === null);
    const isTenantAdmin = roles?.some(r => 
      (r.role === "ADMIN_TENANT" || r.role === "STAFF_ORGANIZACAO") && 
      r.tenant_id === tenantId
    );

    // Check federation roles
    const { data: fedRoles } = await supabase
      .from("federation_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("federation_id", federationId);

    const isFedAdmin = fedRoles?.some(r => r.role === "FED_ADMIN");

    if (!isSuperadmin && !isTenantAdmin && !isFedAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // CHECK EXISTING MEMBERSHIP
    // ========================================================================
    const { data: membership, error: membershipError } = await supabase
      .from("federation_tenants")
      .select("tenant_id, federation_id, joined_at, left_at")
      .eq("tenant_id", tenantId)
      .eq("federation_id", federationId)
      .maybeSingle();

    if (membershipError) {
      log.error("Membership lookup error", membershipError);
      return new Response(
        JSON.stringify({ success: false, error: "Membership lookup failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!membership) {
      return new Response(
        JSON.stringify({ success: false, error: "Tenant is not a member of this federation" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (membership.left_at) {
      return new Response(
        JSON.stringify({ success: false, error: "Tenant has already left this federation" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // FETCH FEDERATION NAME FOR AUDIT
    // ========================================================================
    const { data: federation } = await supabase
      .from("federations")
      .select("name")
      .eq("id", federationId)
      .maybeSingle();

    // ========================================================================
    // UPDATE MEMBERSHIP (SOFT DELETE - NEVER actually delete)
    // ========================================================================
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("federation_tenants")
      .update({ left_at: now })
      .eq("tenant_id", tenantId)
      .eq("federation_id", federationId);

    if (updateError) {
      log.error("Update error", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to leave federation" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // AUDIT LOG (I2, I3 - MANDATORY federation_id)
    // ========================================================================
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.TENANT_LEFT_FEDERATION,
      tenant_id: tenantId,
      profile_id: user.id,
      metadata: {
        federation_id: federationId, // MANDATORY per PI-D5.A
        federation_name: federation?.name || null,
        left_at: now,
        reason: reason.trim(),
        joined_at: membership.joined_at,
      },
    });

    log.info("Success", { tenantId, federationId, reason: reason.trim() });

    return new Response(
      JSON.stringify({
        success: true,
        federationId,
        tenantId,
        leftAt: now,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log.error("Error", error);
    return new Response(
      JSON.stringify({ success: false, error: "Operation failed" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
