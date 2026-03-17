/**
 * Check Membership Renewal Job
 * 
 * ⚠️ DEPENDÊNCIA DE CRON: Esta função DEVE ser agendada via pg_cron para funcionar.
 * Sem o agendamento, lembretes de renovação NÃO serão enviados.
 * 
 * Veja: docs/operacao-configuracoes.md → Seção "4. Cron Jobs"
 * 
 * This function runs on a schedule (daily at 09:00 UTC) to:
 * 1. Find memberships expiring in 7 days
 * 2. Send renewal reminder emails
 * 3. Log the reminder in audit_logs
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("check-membership-renewal", correlationId);

  // ========================================
  // CRON_SECRET VALIDATION
  // ========================================
  const cronSecret = Deno.env.get("CRON_SECRET");
  const requestSecret = req.headers.get("x-cron-secret");

  if (!cronSecret) {
    log.error("CRON_SECRET not configured");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...dynamicCors, "Content-Type": "application/json" } }
    );
  }

  if (requestSecret !== cronSecret) {
    log.error("Invalid or missing x-cron-secret");
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { ...dynamicCors, "Content-Type": "application/json" } }
    );
  }
  // ========================================

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseServiceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    log.info("Starting membership renewal check");

    // Calculate date range: 7 days from now
    const now = new Date();
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    // Format as YYYY-MM-DD for date comparison
    const targetDate = sevenDaysFromNow.toISOString().split("T")[0];
    
    log.info("Looking for memberships expiring on", { targetDate });

    // Find memberships expiring in exactly 7 days that haven't been notified
    const { data: expiringMemberships, error: fetchError } = await supabase
      .from("memberships")
      .select(`
        id,
        end_date,
        renewal_reminder_sent,
        athlete:athletes(id, full_name, email),
        tenant:tenants(id, name)
      `)
      .in("status", ["ACTIVE", "APPROVED"])
      .eq("end_date", targetDate)
      .eq("renewal_reminder_sent", false);

    if (fetchError) {
      throw new Error(`Failed to fetch memberships: ${fetchError.message}`);
    }

    log.info("Found memberships to notify", { count: expiringMemberships?.length || 0 });

    if (!expiringMemberships || expiringMemberships.length === 0) {
      return new Response(
        JSON.stringify({ success: true, notified: 0, message: "No memberships expiring in 7 days" }),
        { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const results: { membershipId: string; success: boolean; error?: string }[] = [];

    for (const membership of expiringMemberships) {
      try {
        const athlete = membership.athlete as unknown as { id: string; full_name: string; email: string } | null;
        const tenant = membership.tenant as unknown as { id: string; name: string } | null;

        if (!athlete?.email) {
          log.info("Skipping membership - no athlete email", { membershipId: membership.id });
          results.push({ membershipId: membership.id, success: false, error: "No athlete email" });
          continue;
        }

        // Format end date for display
        const endDateFormatted = new Date(membership.end_date).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });

        // Send renewal reminder email
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-athlete-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            email_type: "RENEWAL_REMINDER",
            membership_id: membership.id,
            data: {
              athlete_name: athlete.full_name,
              athlete_email: athlete.email,
              tenant_name: tenant?.name,
              end_date: endDateFormatted,
              days_remaining: 7,
            },
          }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          throw new Error(`Email API error: ${errorText}`);
        }

        // Mark as notified
        const { error: updateError } = await supabase
          .from("memberships")
          .update({ renewal_reminder_sent: true })
          .eq("id", membership.id);

        if (updateError) {
          log.info("Failed to update reminder flag", { membershipId: membership.id, error: updateError.message });
        }

        // Log to audit
        await supabase.from("audit_logs").insert({
          event_type: "RENEWAL_REMINDER_SENT",
          tenant_id: tenant?.id,
          metadata: {
            membership_id: membership.id,
            athlete_id: athlete.id,
            athlete_email: athlete.email,
            end_date: membership.end_date,
          },
        });

        log.info("Renewal reminder sent", { membershipId: membership.id, athlete: athlete.email });
        results.push({ membershipId: membership.id, success: true });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log.info("Error processing membership", { membershipId: membership.id, error: errorMessage });
        results.push({ membershipId: membership.id, success: false, error: errorMessage });
      }
    }

    const successCount = results.filter(r => r.success).length;
    log.info("Renewal check complete", { total: results.length, success: successCount });

    return new Response(
      JSON.stringify({ 
        success: true, 
        notified: successCount, 
        total: results.length,
        results,
      }),
      { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.info("Error in renewal check", { error: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
