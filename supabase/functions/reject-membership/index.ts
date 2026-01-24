import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[REJECT-MEMBERSHIP] ${step}${detailsStr}`);
};

interface RejectMembershipRequest {
  membershipId: string;
  reason: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth token from request
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Verify the user and get their ID
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) {
      throw new Error("Unauthorized: Invalid token");
    }

    const adminProfileId = user.id;
    logStep("Admin authenticated", { adminProfileId });

    const { membershipId, reason }: RejectMembershipRequest = await req.json();

    if (!membershipId) {
      throw new Error("Missing membershipId");
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error("Rejection reason is required");
    }

    // 1. Fetch membership and validate
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select(`
        id,
        status,
        tenant_id,
        applicant_data
      `)
      .eq("id", membershipId)
      .maybeSingle();

    if (membershipError || !membership) {
      throw new Error(membershipError?.message || "Membership not found");
    }

    logStep("Fetched membership", { status: membership.status });

    // Validate status
    if (membership.status !== "PENDING_REVIEW") {
      throw new Error(`Invalid status: ${membership.status}. Only PENDING_REVIEW can be rejected.`);
    }

    // 2. Check admin permissions
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", adminProfileId)
      .or(`tenant_id.eq.${membership.tenant_id},tenant_id.is.null`);

    const validRoles = ["SUPERADMIN_GLOBAL", "ADMIN_TENANT", "STAFF_ORGANIZACAO"];
    const hasPermission = roles?.some(r => validRoles.includes(r.role));
    
    if (!hasPermission) {
      throw new Error("Forbidden: Insufficient permissions");
    }

    logStep("Admin permissions verified");

    // 3. UPDATE MEMBERSHIP to CANCELLED
    const { error: updateError } = await supabase
      .from("memberships")
      .update({
        status: "CANCELLED",
        rejected_at: new Date().toISOString(),
        rejection_reason: reason.trim(),
        rejected_by_profile_id: adminProfileId,
        review_notes: reason.trim(),
        reviewed_by_profile_id: adminProfileId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", membershipId);

    if (updateError) {
      throw new Error(`Failed to update membership: ${updateError.message}`);
    }

    logStep("Membership rejected");

    // Extract applicant name for audit log
    const applicantData = membership.applicant_data as { full_name?: string } | null;
    const applicantName = applicantData?.full_name || "Unknown";

    // 4. CREATE AUDIT LOG
    await supabase.from("audit_logs").insert({
      event_type: "MEMBERSHIP_REJECTED",
      tenant_id: membership.tenant_id,
      profile_id: adminProfileId,
      metadata: {
        membership_id: membershipId,
        applicant_name: applicantName,
        rejected_by: adminProfileId,
        rejection_reason: reason.trim(),
        occurred_at: new Date().toISOString(),
      },
    });

    logStep("Audit log created");

    // Note: Documents remain in tmp/ - cleanup job should handle them later

    return new Response(
      JSON.stringify({
        success: true,
        membershipId,
        status: "CANCELLED",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("Error", { error: errorMessage });
    
    const statusCode = errorMessage.includes("Unauthorized") ? 401 
      : errorMessage.includes("Forbidden") ? 403 
      : errorMessage.includes("Invalid status") ? 400
      : errorMessage.includes("required") ? 400
      : 500;

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: statusCode }
    );
  }
});
