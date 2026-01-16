import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[NOTIFY-NEW-GRADING] ${step}${detailsStr}`);
};

interface NotifyGradingRequest {
  grading_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    logStep("Processing new grading notification", { grading_id });

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
      .single();

    if (gradingError || !grading) {
      throw new Error(`Grading not found: ${grading_id}`);
    }

    const athlete = grading.athlete as unknown as { id: string; full_name: string; email: string } | null;
    const gradingLevel = grading.grading_level as unknown as { id: string; display_name: string; code: string } | null;
    const tenant = grading.tenant as unknown as { id: string; name: string } | null;
    const diploma = grading.diploma as unknown as { id: string; pdf_url: string | null; status: string } | null;

    if (!athlete?.email) {
      logStep("No athlete email found, skipping notification");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "No athlete email" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    logStep("Sending grading notification", { 
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

    // Log to audit
    await supabase.from("audit_logs").insert({
      event_type: "GRADING_NOTIFICATION_SENT",
      tenant_id: tenant?.id,
      metadata: {
        grading_id,
        athlete_id: athlete.id,
        athlete_email: athlete.email,
        level_name: gradingLevel?.display_name,
      },
    });

    logStep("Grading notification sent successfully", { grading_id, athlete: athlete.email });

    return new Response(
      JSON.stringify({ success: true, grading_id, athlete_email: athlete.email }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("Error sending grading notification", { error: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
