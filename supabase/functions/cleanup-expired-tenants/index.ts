/**
 * cleanup-expired-tenants - Daily job to permanently delete expired tenants
 * 
 * Executes daily at 03:00 UTC via pg_cron
 * 
 * SAFEGUARDS (A2 - Soft Guard de Pagamento):
 * 1. Check for recent payment (last 30 days)
 * 2. Verify manual override is not active
 * 3. Confirm status is still PENDING_DELETE
 * 4. Check athlete count (>50 requires manual review)
 * 
 * Flow:
 * 1. Find tenants with status='PENDING_DELETE' and scheduled_delete_at < NOW()
 * 2. Execute canSafelyDelete() - if FAILS, SKIP
 * 3. Save minimal data to deleted_tenants (LGPD)
 * 4. Cascade delete all tenant data
 * 5. Send final email "TENANT_DELETED"
 * 6. Alert superadmin about skipped tenants
 */

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

type SupabaseClientAny = SupabaseClient<any, any, any>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CLEANUP-EXPIRED-TENANTS] ${step}${detailsStr}`);
};

interface SafeDeleteResult {
  safe: boolean;
  reason?: string;
}

/**
 * Safeguard checks before deletion (A2 requirement)
 * 
 * P0 FIX: Payment check now filters by tenant's stripe_customer_id
 * to avoid global payment blocking all tenant deletions.
 */
async function canSafelyDelete(
  supabase: SupabaseClientAny,
  tenantId: string
): Promise<SafeDeleteResult> {
  // 1. Fetch tenant billing info (includes stripe_customer_id)
  const { data: billing } = await supabase
    .from("tenant_billing")
    .select("status, is_manual_override, stripe_customer_id")
    .eq("tenant_id", tenantId)
    .single();

  // 2. Check manual override first
  if (billing?.is_manual_override) {
    return { safe: false, reason: "MANUAL_OVERRIDE_ACTIVE" };
  }

  // 3. Verify status is still PENDING_DELETE
  if (billing?.status !== "PENDING_DELETE") {
    return { safe: false, reason: "STATUS_CHANGED" };
  }

  // 4. P0 FIX: Check for recent payment FILTERED BY TENANT's stripe_customer_id
  if (billing?.stripe_customer_id) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    // Query webhook_events for invoice.payment_succeeded
    const { data: recentPayments } = await supabase
      .from("webhook_events")
      .select("id, payload")
      .eq("event_type", "invoice.payment_succeeded")
      .gt("created_at", thirtyDaysAgo);

    // Filter payments by this tenant's stripe_customer_id in the payload
    const hasRecentPayment = recentPayments?.some((event: { payload: { customer?: string } | null }) => {
      const payload = event.payload;
      return payload?.customer === billing.stripe_customer_id;
    });

    if (hasRecentPayment) {
      logStep("Recent payment found for tenant", { 
        tenantId, 
        stripe_customer_id: billing.stripe_customer_id 
      });
      return { safe: false, reason: "RECENT_PAYMENT_FOUND" };
    }
  }

  // 5. Check athlete count (protection against deleting large organizations)
  const { count: activeAthletes } = await supabase
    .from("athletes")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if ((activeAthletes || 0) > 50) {
    return { safe: false, reason: "TOO_MANY_ATHLETES" };
  }

  return { safe: true };
}

/**
 * Save minimal data for LGPD compliance before deletion
 */
async function saveDeletedTenantRecord(
  supabase: SupabaseClientAny,
  tenantId: string
): Promise<void> {
  // Get tenant info
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("id", tenantId)
    .single();

  // Get billing info
  const { data: billing } = await supabase
    .from("tenant_billing")
    .select("trial_started_at")
    .eq("tenant_id", tenantId)
    .single();

  // Get admin email
  const { data: adminRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "ADMIN_TENANT")
    .limit(1);

  let creatorEmail: string | null = null;
  if (adminRoles && adminRoles.length > 0) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", adminRoles[0].user_id)
      .single();
    creatorEmail = profile?.email || null;
  }

  // Count data for audit
  const { count: athletesCount } = await supabase
    .from("athletes")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const { count: membershipsCount } = await supabase
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const { count: eventsCount } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  // Insert deleted tenant record
  await supabase.from("deleted_tenants").insert({
    original_tenant_id: tenantId,
    tenant_slug: tenant?.slug || "unknown",
    tenant_name: tenant?.name || "Unknown",
    creator_email: creatorEmail,
    trial_started_at: billing?.trial_started_at,
    deletion_reason: "trial_expired_no_conversion",
    athletes_count: athletesCount || 0,
    memberships_count: membershipsCount || 0,
    events_count: eventsCount || 0,
    metadata: {
      deleted_by: "cleanup-expired-tenants-job",
      automatic: true,
    },
  });
}

/**
 * Cascade delete all tenant data in correct order
 */
async function cascadeDeleteTenantData(
  supabase: SupabaseClientAny,
  tenantId: string
): Promise<void> {
  // Order matters to avoid FK constraint errors
  const tables = [
    "digital_cards",
    "diplomas",
    "athlete_gradings",
    "event_registrations",
    "event_results",
    "event_categories",
    "events",
    "documents",
    "memberships",
    "guardian_links",
    "guardians",
    "athletes",
    "academy_coaches",
    "coaches",
    "academies",
    "grading_levels",
    "grading_schemes",
    "user_roles",
    "tenant_invoices",
    "tenant_billing",
    // audit_logs preserved for compliance
  ];

  for (const table of tables) {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("tenant_id", tenantId);

      if (error) {
        logStep(`Warning: Error deleting from ${table}`, { error: error.message });
      } else {
        logStep(`Deleted from ${table}`, { tenantId });
      }
    } catch (err) {
      logStep(`Warning: Exception deleting from ${table}`, { 
        error: err instanceof Error ? err.message : "Unknown" 
      });
    }
  }

  // Finally delete the tenant itself
  const { error: tenantError } = await supabase
    .from("tenants")
    .delete()
    .eq("id", tenantId);

  if (tenantError) {
    throw new Error(`Failed to delete tenant: ${tenantError.message}`);
  }
}

async function sendBillingEmail(
  supabaseUrl: string,
  supabaseServiceKey: string,
  eventType: string,
  tenantId: string
) {
  try {
    const emailUrl = `${supabaseUrl}/functions/v1/send-billing-email`;
    await fetch(emailUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ event_type: eventType, tenant_id: tenantId }),
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

  // ========================================
  // CRON_SECRET VALIDATION
  // ========================================
  const cronSecret = Deno.env.get("CRON_SECRET");
  const requestSecret = req.headers.get("x-cron-secret");

  if (!cronSecret) {
    console.error("[CLEANUP-EXPIRED-TENANTS] CRON_SECRET not configured");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (requestSecret !== cronSecret) {
    console.error("[CLEANUP-EXPIRED-TENANTS] Invalid or missing x-cron-secret");
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  // ========================================

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseServiceKey) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    logStep("Starting cleanup-expired-tenants job");

    // Find tenants scheduled for deletion
    const now = new Date().toISOString();
    const { data: pendingDelete, error: fetchError } = await supabase
      .from("tenant_billing")
      .select("id, tenant_id, status, scheduled_delete_at")
      .eq("status", "PENDING_DELETE")
      .lt("scheduled_delete_at", now);

    if (fetchError) {
      throw new Error(`Failed to fetch pending deletions: ${fetchError.message}`);
    }

    logStep("Found pending deletions", { count: pendingDelete?.length || 0 });

    const results = {
      deleted: 0,
      skipped: 0,
      errors: 0,
      deletedTenantIds: [] as string[],
      skippedTenants: [] as { tenantId: string; reason: string }[],
    };

    for (const billing of pendingDelete || []) {
      try {
        // Execute safeguards
        const safetyCheck = await canSafelyDelete(supabase, billing.tenant_id);

        if (!safetyCheck.safe) {
          // SKIP this tenant
          results.skipped++;
          results.skippedTenants.push({
            tenantId: billing.tenant_id,
            reason: safetyCheck.reason || "UNKNOWN",
          });

          // Log skip to audit
          await supabase.from("audit_logs").insert({
            event_type: "CLEANUP_SKIPPED",
            tenant_id: billing.tenant_id,
            metadata: {
              reason: safetyCheck.reason,
              scheduled_delete_at: billing.scheduled_delete_at,
              automatic: true,
              source: "cleanup-expired-tenants-job",
            },
          });

          logStep("Skipped tenant deletion", { 
            tenantId: billing.tenant_id, 
            reason: safetyCheck.reason 
          });
          continue;
        }

        // Save LGPD audit record
        await saveDeletedTenantRecord(supabase, billing.tenant_id);

        // Cascade delete all data
        await cascadeDeleteTenantData(supabase, billing.tenant_id);

        // Send final email (to preserved creator email)
        sendBillingEmail(supabaseUrl, supabaseServiceKey, "TENANT_DELETED", billing.tenant_id);

        results.deleted++;
        results.deletedTenantIds.push(billing.tenant_id);
        logStep("Deleted tenant", { tenantId: billing.tenant_id });
      } catch (err) {
        results.errors++;
        logStep("Error deleting tenant", { 
          tenantId: billing.tenant_id, 
          error: err instanceof Error ? err.message : "Unknown" 
        });

        // Log error to audit
        await supabase.from("audit_logs").insert({
          event_type: "CLEANUP_ERROR",
          tenant_id: billing.tenant_id,
          metadata: {
            error: err instanceof Error ? err.message : "Unknown",
            automatic: true,
            source: "cleanup-expired-tenants-job",
          },
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
