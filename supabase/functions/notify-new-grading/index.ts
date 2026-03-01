import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
import {
  requireBillingStatus,
  billingRestrictedResponse,
} from "../_shared/requireBillingStatus.ts";
import { logBillingRestricted } from "../_shared/decision-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyGradingRequest {
  grading_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("notify-new-grading", correlationId);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseServiceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { grading_id }: NotifyGradingRequest = await req.json();

    if (!grading_id) {
      throw new Error("Missing grading_id");
    }

    log.info("Processing new grading notification", { grading_id });

    // Fetch grading with related data
    const { data: grading, error: gradingError } = await supabase
      .from("athlete_gradings")
      .select(`
        id,
        promotion_date,
        athlete:athletes(id, full_name, email),
        grading_level:grading_levels(id, display_name, code),
        tenant:tenants(id, name),
        diploma:diplomas(id, pdf_url, status)
      `)
      .eq("id", grading_id)
      .maybeSingle();

    if (gradingError || !grading) {
      throw new Error(`Grading not found: ${grading_id}`);
    }

    const athlete = grading.athlete as unknown as { id: string; full_name: string; email: string } | null;
    const gradingLevel = grading.grading_level as unknown as { id: string; display_name: string; code: string } | null;
    const tenant = grading.tenant as unknown as { id: string; name: string } | null;
    const diploma = grading.diploma as unknown as { id: string; pdf_url: string | null; status: string } | null;

    if (!athlete?.email) {
      log.info("No athlete email found, skipping notification");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "No athlete email" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ========================================================================
    // BILLING STATUS CHECK (P1 - Block operations on restricted tenants)
    // ========================================================================
    if (tenant?.id) {
      const billingCheck = await requireBillingStatus(supabase, tenant.id);
      if (!billingCheck.allowed) {
        log.info("Billing status blocked operation", { 
          status: billingCheck.status, 
          code: billingCheck.code 
        });
        
        await logBillingRestricted(supabase, {
          operation: 'notify-new-grading',
          user_id: athlete.id,
          tenant_id: tenant.id,
          billing_status: billingCheck.status,
        });
        
        return billingRestrictedResponse(billingCheck.status);
      }

      log.info("Billing status OK", { status: billingCheck.status });
    }

    log.info("Sending grading notification", { 
      athlete: athlete.full_name, 
      level: gradingLevel?.display_name 
    });

    // Send email notification
    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-athlete-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        email_type: "NEW_GRADING",
        data: {
          athlete_name: athlete.full_name,
          athlete_email: athlete.email,
          tenant_name: tenant?.name,
          level_name: gradingLevel?.display_name || gradingLevel?.code,
          diploma_url: diploma?.status === "ISSUED" ? diploma.pdf_url : null,
        },
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      throw new Error(`Email API error: ${errorText}`);
    }

    // Log to audit using shared logger
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.GRADING_NOTIFICATION_SENT,
      tenant_id: tenant?.id || null,
      metadata: {
        grading_id,
        athlete_id: athlete.id,
        athlete_email: athlete.email,
        level_name: gradingLevel?.display_name,
        has_diploma: diploma?.status === 'ISSUED',
        source: 'notify-new-grading',
      },
    });

    log.info("Grading notification sent successfully", { grading_id, athlete: athlete.email });

    return new Response(
      JSON.stringify({ success: true, grading_id, athlete_email: athlete.email }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Error sending grading notification", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
