import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CLEANUP-ABANDONED] ${step}${detailsStr}`);
};

/**
 * Cleanup Abandoned Memberships Job
 * 
 * This function runs on a schedule (daily) to:
 * 1. Find memberships in DRAFT status that are older than 24 hours
 * 2. Mark them as ABANDONED (preserves data for audit)
 * 3. Log the cleanup in audit_logs
 * 
 * This helps prevent database pollution from incomplete registrations.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    logStep("Starting cleanup job for abandoned memberships");

    // Calculate cutoff time (24 hours ago)
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 24);
    const cutoffIso = cutoffTime.toISOString();

    logStep("Looking for DRAFT memberships older than", { cutoff: cutoffIso });

    // Find abandoned memberships (DRAFT status, older than 24 hours, no payment)
    const { data: abandonedMemberships, error: fetchError } = await supabase
      .from("memberships")
      .select(`
        id,
        created_at,
        status,
        payment_status,
        athlete_id,
        tenant_id
      `)
      .eq("status", "DRAFT")
      .eq("payment_status", "NOT_PAID")
      .lt("created_at", cutoffIso);

    if (fetchError) {
      throw new Error(`Failed to fetch memberships: ${fetchError.message}`);
    }

    logStep("Found abandoned memberships", { count: abandonedMemberships?.length || 0 });

    if (!abandonedMemberships || abandonedMemberships.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          cleaned: 0, 
          message: "No abandoned memberships to clean up" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const results: { membershipId: string; success: boolean; error?: string }[] = [];

    for (const membership of abandonedMemberships) {
      try {
        // Update status to CANCELLED (not deleting to preserve audit trail)
        const { error: updateError } = await supabase
          .from("memberships")
          .update({ 
            status: "CANCELLED",
            updated_at: new Date().toISOString()
          })
          .eq("id", membership.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Log to audit
        await supabase.from("audit_logs").insert({
          event_type: "MEMBERSHIP_ABANDONED_CLEANUP",
          tenant_id: membership.tenant_id,
          metadata: {
            membership_id: membership.id,
            athlete_id: membership.athlete_id,
            created_at: membership.created_at,
            cleaned_at: new Date().toISOString(),
            reason: "DRAFT status for more than 24 hours without payment",
          },
        });

        logStep("Membership marked as abandoned", { membershipId: membership.id });
        results.push({ membershipId: membership.id, success: true });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logStep("Error cleaning membership", { membershipId: membership.id, error: errorMessage });
        results.push({ membershipId: membership.id, success: false, error: errorMessage });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logStep("Cleanup completed", { successCount, failCount });

    return new Response(
      JSON.stringify({ 
        success: true, 
        cleaned: successCount,
        failed: failCount,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("Error", { error: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
