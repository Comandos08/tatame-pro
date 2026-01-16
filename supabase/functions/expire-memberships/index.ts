import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[EXPIRE-MEMBERSHIPS] ${step}${detailsStr}`);
};

/**
 * Expire Memberships Job
 * 
 * This function runs on a schedule (daily) to:
 * 1. Find all memberships with status ACTIVE/APPROVED where end_date < today
 * 2. Update their status to EXPIRED
 * 3. Log the change in audit_logs
 * 
 * This is idempotent - running multiple times won't cause issues.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    logStep("Starting membership expiration job");

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];
    logStep("Checking memberships with end_date before", { today });

    // Find memberships that should be expired
    const { data: expiredMemberships, error: fetchError } = await supabase
      .from("memberships")
      .select(`
        id,
        end_date,
        status,
        athlete_id,
        tenant_id,
        athlete:athletes(full_name, email)
      `)
      .in("status", ["ACTIVE", "APPROVED"])
      .lt("end_date", today);

    if (fetchError) {
      throw new Error(`Failed to fetch memberships: ${fetchError.message}`);
    }

    logStep("Found memberships to expire", { count: expiredMemberships?.length || 0 });

    if (!expiredMemberships || expiredMemberships.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          expired: 0, 
          message: "No memberships to expire" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const results: { membershipId: string; success: boolean; error?: string }[] = [];

    for (const membership of expiredMemberships) {
      try {
        // Update status to EXPIRED
        const { error: updateError } = await supabase
          .from("memberships")
          .update({ 
            status: "EXPIRED",
            updated_at: new Date().toISOString()
          })
          .eq("id", membership.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Log to audit using shared logger
        await createAuditLog(supabase, {
          event_type: AUDIT_EVENTS.MEMBERSHIP_EXPIRED,
          tenant_id: membership.tenant_id,
          metadata: {
            membership_id: membership.id,
            athlete_id: membership.athlete_id,
            previous_status: membership.status,
            new_status: 'EXPIRED',
            end_date: membership.end_date,
            automatic: true,
            scheduled: true,
            source: 'expire-memberships-job',
          },
        });

        logStep("Membership expired", { 
          membershipId: membership.id, 
          athleteEmail: (membership.athlete as { email?: string })?.email 
        });
        
        results.push({ membershipId: membership.id, success: true });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logStep("Error expiring membership", { membershipId: membership.id, error: errorMessage });
        results.push({ membershipId: membership.id, success: false, error: errorMessage });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logStep("Job completed", { successCount, failCount });

    return new Response(
      JSON.stringify({ 
        success: true, 
        expired: successCount,
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
