/**
 * expire-trials - Daily job to transition TRIALING → TRIAL_EXPIRED
 * 
 * Executes daily at 00:05 UTC via pg_cron
 * 
 * Flow:
 * 1. Find tenants with status='TRIALING' and trial_expires_at < NOW()
 * 2. Update status to 'TRIAL_EXPIRED'
 * 3. Set grace_period_ends_at = NOW() + 8 days
 * 4. Keep tenant.is_active = true (partial access allowed)
 * 5. Send email "TRIAL_EXPIRED"
 * 6. Log to audit_logs
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRACE_PERIOD_DAYS = 8;

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[EXPIRE-TRIALS] ${step}${detailsStr}`);
};

async function sendBillingEmail(
  supabaseUrl: string,
  supabaseServiceKey: string,
  eventType: string,
  tenantId: string,
  data?: Record<string, unknown>
) {
  try {
    const emailUrl = `${supabaseUrl}/functions/v1/send-billing-email`;
    await fetch(emailUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ event_type: eventType, tenant_id: tenantId, data }),
    });
    logStep("Billing email triggered", { eventType, tenantId });
  } catch (err) {
    logStep("Failed to trigger billing email", { error: err instanceof Error ? err.message : "Unknown" });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseServiceKey) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    logStep("Starting expire-trials job");

    // Find tenants with expired trials
    const now = new Date().toISOString();
    const { data: expiredTrials, error: fetchError } = await supabase
      .from("tenant_billing")
      .select("id, tenant_id, status, trial_expires_at")
      .eq("status", "TRIALING")
      .lt("trial_expires_at", now)
      .is("is_manual_override", false);

    if (fetchError) {
      throw new Error(`Failed to fetch expired trials: ${fetchError.message}`);
    }

    logStep("Found expired trials", { count: expiredTrials?.length || 0 });

    const results = {
      processed: 0,
      errors: 0,
      tenantIds: [] as string[],
    };

    for (const billing of expiredTrials || []) {
      try {
        const gracePeriodEnd = new Date();
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);

        // Update billing status to TRIAL_EXPIRED
        const { error: updateError } = await supabase
          .from("tenant_billing")
          .update({
            status: "TRIAL_EXPIRED",
            grace_period_ends_at: gracePeriodEnd.toISOString(),
          })
          .eq("id", billing.id)
          .eq("status", "TRIALING"); // Optimistic lock

        if (updateError) {
          throw updateError;
        }

        // Note: tenant.is_active remains true for partial access

        // Log to audit
        await supabase.from("audit_logs").insert({
          event_type: "TRIAL_EXPIRED",
          tenant_id: billing.tenant_id,
          metadata: {
            billing_id: billing.id,
            trial_expires_at: billing.trial_expires_at,
            grace_period_ends_at: gracePeriodEnd.toISOString(),
            automatic: true,
            source: "expire-trials-job",
          },
        });

        // Send email notification
        sendBillingEmail(supabaseUrl, supabaseServiceKey, "TRIAL_EXPIRED", billing.tenant_id, {
          grace_period_end: gracePeriodEnd.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }),
        });

        results.processed++;
        results.tenantIds.push(billing.tenant_id);
        logStep("Expired trial", { tenantId: billing.tenant_id });
      } catch (err) {
        results.errors++;
        logStep("Error expiring trial", { 
          tenantId: billing.tenant_id, 
          error: err instanceof Error ? err.message : "Unknown" 
        });
      }
    }

    logStep("Job completed", results);

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("Job failed", { error: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
