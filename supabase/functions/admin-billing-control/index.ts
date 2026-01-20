/**
 * Admin Billing Control Edge Function - Production Level
 * 
 * SECURITY: Only accessible by SUPERADMIN_GLOBAL users.
 * Provides manual billing overrides for tenant management.
 * 
 * Actions:
 * - extend-trial: Extend tenant trial by X days (max 90)
 * - mark-as-paid: Mark tenant as paid until a specific date (max 12 months)
 * - block-tenant: Force block a tenant (requires confirmation for ACTIVE tenants)
 * - unblock-tenant: Force unblock a tenant
 * - reset-to-stripe: Remove manual overrides and sync with Stripe
 * 
 * All actions are logged to audit_logs with full before/after state.
 * Override flags track manual interventions for audit purposes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createAuditLog } from "../_shared/audit-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Supported actions
type BillingAction = "extend-trial" | "mark-as-paid" | "block-tenant" | "unblock-tenant" | "reset-to-stripe";

// Production safeguards
const MAX_TRIAL_DAYS = 90;
const MAX_PAID_MONTHS = 12;

interface RequestPayload {
  action: BillingAction;
  tenantId: string;
  days?: number;       // For extend-trial
  untilDate?: string;  // For mark-as-paid (ISO date)
  reason: string;
  confirmBlock?: boolean; // Double confirmation for blocking ACTIVE tenants
}

// Helper to create service client
function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// Helper to create user client with auth context
function getUserClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

// Validate user is SUPERADMIN_GLOBAL
async function validateSuperadmin(authHeader: string): Promise<{ valid: boolean; userId?: string; error?: string }> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false, error: "Missing or invalid authorization header" };
  }

  const userClient = getUserClient(authHeader);
  const token = authHeader.replace("Bearer ", "");
  
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return { valid: false, error: "Invalid token" };
  }

  const userId = claimsData.claims.sub;
  if (!userId) {
    return { valid: false, error: "User ID not found in token" };
  }

  // Check if user has SUPERADMIN_GLOBAL role
  const serviceClient = getServiceClient();
  const { data: role, error: roleError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "SUPERADMIN_GLOBAL")
    .is("tenant_id", null)
    .maybeSingle();

  if (roleError || !role) {
    return { valid: false, error: "Access denied: SUPERADMIN_GLOBAL role required" };
  }

  return { valid: true, userId };
}

// Get current billing state for audit logging
async function getCurrentBillingState(serviceClient: ReturnType<typeof getServiceClient>, tenantId: string) {
  const { data: billing } = await serviceClient
    .from("tenant_billing")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { data: tenant } = await serviceClient
    .from("tenants")
    .select("id, name, slug, is_active")
    .eq("id", tenantId)
    .maybeSingle();

  return { billing, tenant };
}

// Set override flags
async function setOverrideFlags(
  serviceClient: ReturnType<typeof getServiceClient>,
  tenantId: string,
  userId: string,
  reason: string
) {
  await serviceClient
    .from("tenant_billing")
    .update({
      is_manual_override: true,
      override_by: userId,
      override_at: new Date().toISOString(),
      override_reason: reason,
    })
    .eq("tenant_id", tenantId);
}

// Clear override flags
async function clearOverrideFlags(
  serviceClient: ReturnType<typeof getServiceClient>,
  tenantId: string
) {
  await serviceClient
    .from("tenant_billing")
    .update({
      is_manual_override: false,
      override_by: null,
      override_at: null,
      override_reason: null,
    })
    .eq("tenant_id", tenantId);
}

// Action: Extend Trial
async function extendTrial(
  serviceClient: ReturnType<typeof getServiceClient>,
  tenantId: string,
  days: number,
  reason: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  // Safeguard: Max 90 days
  if (days > MAX_TRIAL_DAYS) {
    return { success: false, error: `Trial extension limited to ${MAX_TRIAL_DAYS} days maximum` };
  }

  const before = await getCurrentBillingState(serviceClient, tenantId);
  
  if (!before.billing) {
    return { success: false, error: "Tenant billing record not found" };
  }

  const currentEnd = before.billing.current_period_end 
    ? new Date(before.billing.current_period_end)
    : new Date();
  
  const newEndDate = new Date(currentEnd);
  newEndDate.setDate(newEndDate.getDate() + days);

  const { error: updateError } = await serviceClient
    .from("tenant_billing")
    .update({
      status: "TRIALING",
      current_period_end: newEndDate.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Set override flags
  await setOverrideFlags(serviceClient, tenantId, userId, reason);

  const after = await getCurrentBillingState(serviceClient, tenantId);

  // Log the action
  await createAuditLog(serviceClient, {
    event_type: "BILLING_OVERRIDE_EXTEND_TRIAL",
    tenant_id: tenantId,
    profile_id: userId,
    metadata: {
      action: "extend-trial",
      days,
      reason,
      previous_status: before.billing?.status,
      new_status: "TRIALING",
      previous_period_end: before.billing?.current_period_end,
      new_period_end: newEndDate.toISOString(),
      source: "admin_control_tower",
      previous_mode: before.billing?.is_manual_override ? "manual" : "stripe",
      new_mode: "manual",
      operator: userId,
    },
  });

  return { success: true };
}

// Action: Mark as Paid
async function markAsPaid(
  serviceClient: ReturnType<typeof getServiceClient>,
  tenantId: string,
  untilDate: string,
  reason: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const before = await getCurrentBillingState(serviceClient, tenantId);
  
  if (!before.billing) {
    return { success: false, error: "Tenant billing record not found" };
  }

  const endDate = new Date(untilDate);
  if (isNaN(endDate.getTime())) {
    return { success: false, error: "Invalid date format" };
  }

  // Safeguard: Max 12 months
  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + MAX_PAID_MONTHS);
  if (endDate > maxDate) {
    return { success: false, error: `Mark as paid limited to ${MAX_PAID_MONTHS} months maximum` };
  }

  const { error: updateError } = await serviceClient
    .from("tenant_billing")
    .update({
      status: "ACTIVE",
      current_period_start: new Date().toISOString(),
      current_period_end: endDate.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Set override flags
  await setOverrideFlags(serviceClient, tenantId, userId, reason);

  const after = await getCurrentBillingState(serviceClient, tenantId);

  await createAuditLog(serviceClient, {
    event_type: "BILLING_OVERRIDE_MARK_PAID",
    tenant_id: tenantId,
    profile_id: userId,
    metadata: {
      action: "mark-as-paid",
      until_date: untilDate,
      reason,
      previous_status: before.billing?.status,
      new_status: "ACTIVE",
      source: "admin_control_tower",
      previous_mode: before.billing?.is_manual_override ? "manual" : "stripe",
      new_mode: "manual",
      operator: userId,
    },
  });

  return { success: true };
}

// Action: Block Tenant
async function blockTenant(
  serviceClient: ReturnType<typeof getServiceClient>,
  tenantId: string,
  reason: string,
  userId: string,
  confirmBlock: boolean
): Promise<{ success: boolean; error?: string; requiresConfirmation?: boolean }> {
  const before = await getCurrentBillingState(serviceClient, tenantId);
  
  if (!before.billing) {
    return { success: false, error: "Tenant billing record not found" };
  }

  // Safeguard: Double confirmation required for blocking ACTIVE tenants
  if (before.billing.status === "ACTIVE" && !confirmBlock) {
    return { 
      success: false, 
      requiresConfirmation: true,
      error: "Blocking an ACTIVE tenant requires confirmation. Set confirmBlock: true to proceed." 
    };
  }

  const { error: updateError } = await serviceClient
    .from("tenant_billing")
    .update({
      status: "PAST_DUE",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Set override flags
  await setOverrideFlags(serviceClient, tenantId, userId, reason);

  await createAuditLog(serviceClient, {
    event_type: "BILLING_OVERRIDE_BLOCK",
    tenant_id: tenantId,
    profile_id: userId,
    metadata: {
      action: "block-tenant",
      reason,
      previous_status: before.billing?.status,
      new_status: "PAST_DUE",
      required_confirmation: before.billing?.status === "ACTIVE",
      source: "admin_control_tower",
      previous_mode: before.billing?.is_manual_override ? "manual" : "stripe",
      new_mode: "manual",
      operator: userId,
    },
  });

  return { success: true };
}

// Action: Unblock Tenant
async function unblockTenant(
  serviceClient: ReturnType<typeof getServiceClient>,
  tenantId: string,
  reason: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const before = await getCurrentBillingState(serviceClient, tenantId);
  
  if (!before.billing) {
    return { success: false, error: "Tenant billing record not found" };
  }

  // Extend period by 30 days when unblocking
  const newEndDate = new Date();
  newEndDate.setDate(newEndDate.getDate() + 30);

  const { error: updateError } = await serviceClient
    .from("tenant_billing")
    .update({
      status: "ACTIVE",
      current_period_start: new Date().toISOString(),
      current_period_end: newEndDate.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Set override flags
  await setOverrideFlags(serviceClient, tenantId, userId, reason);

  await createAuditLog(serviceClient, {
    event_type: "BILLING_OVERRIDE_UNBLOCK",
    tenant_id: tenantId,
    profile_id: userId,
    metadata: {
      action: "unblock-tenant",
      reason,
      previous_status: before.billing?.status,
      new_status: "ACTIVE",
      new_period_end: newEndDate.toISOString(),
      source: "admin_control_tower",
      previous_mode: before.billing?.is_manual_override ? "manual" : "stripe",
      new_mode: "manual",
      operator: userId,
    },
  });

  return { success: true };
}

// Action: Reset to Stripe
async function resetToStripe(
  serviceClient: ReturnType<typeof getServiceClient>,
  tenantId: string,
  reason: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const before = await getCurrentBillingState(serviceClient, tenantId);
  
  if (!before.billing) {
    return { success: false, error: "Tenant billing record not found" };
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return { success: false, error: "Stripe integration not configured" };
  }

  let stripeStatus: string = "INCOMPLETE";
  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  // If there's a Stripe subscription, fetch its real status
  if (before.billing.stripe_subscription_id) {
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const subscription = await stripe.subscriptions.retrieve(before.billing.stripe_subscription_id);
      
      // Map Stripe status to our enum
      const statusMap: Record<string, string> = {
        active: "ACTIVE",
        trialing: "TRIALING",
        past_due: "PAST_DUE",
        canceled: "CANCELED",
        unpaid: "UNPAID",
        incomplete: "INCOMPLETE",
        incomplete_expired: "INCOMPLETE",
        paused: "PAST_DUE",
      };

      stripeStatus = statusMap[subscription.status] || "INCOMPLETE";
      periodStart = new Date(subscription.current_period_start * 1000).toISOString();
      periodEnd = new Date(subscription.current_period_end * 1000).toISOString();
    } catch (stripeError) {
      console.error("Error fetching Stripe subscription:", stripeError);
      // If subscription not found or error, set to INCOMPLETE
      stripeStatus = "INCOMPLETE";
    }
  } else if (before.billing.stripe_customer_id) {
    // Check if customer has any active subscriptions
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const subscriptions = await stripe.subscriptions.list({
        customer: before.billing.stripe_customer_id,
        status: "all",
        limit: 1,
      });

      if (subscriptions.data.length > 0) {
        const sub = subscriptions.data[0];
        const statusMap: Record<string, string> = {
          active: "ACTIVE",
          trialing: "TRIALING",
          past_due: "PAST_DUE",
          canceled: "CANCELED",
          unpaid: "UNPAID",
          incomplete: "INCOMPLETE",
          incomplete_expired: "INCOMPLETE",
          paused: "PAST_DUE",
        };
        stripeStatus = statusMap[sub.status] || "INCOMPLETE";
        periodStart = new Date(sub.current_period_start * 1000).toISOString();
        periodEnd = new Date(sub.current_period_end * 1000).toISOString();
      }
    } catch (stripeError) {
      console.error("Error fetching Stripe customer subscriptions:", stripeError);
    }
  }

  // Update billing to Stripe-controlled status
  const { error: updateError } = await serviceClient
    .from("tenant_billing")
    .update({
      status: stripeStatus,
      current_period_start: periodStart || before.billing.current_period_start,
      current_period_end: periodEnd || before.billing.current_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Clear override flags
  await clearOverrideFlags(serviceClient, tenantId);

  await createAuditLog(serviceClient, {
    event_type: "BILLING_OVERRIDE_RESET",
    tenant_id: tenantId,
    profile_id: userId,
    metadata: {
      action: "reset-to-stripe",
      reason,
      previous_status: before.billing?.status,
      new_status: stripeStatus,
      stripe_subscription_id: before.billing?.stripe_subscription_id,
      source: "admin_control_tower",
      previous_mode: before.billing?.is_manual_override ? "manual" : "stripe",
      new_mode: "stripe",
      operator: userId,
    },
  });

  return { success: true };
}

// Main handler
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate superadmin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validation = await validateSuperadmin(authHeader);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = validation.userId!;
    const serviceClient = getServiceClient();

    // Parse request
    const payload: RequestPayload = await req.json();
    
    if (!payload.action || !payload.tenantId || !payload.reason) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: action, tenantId, reason" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate tenant exists
    const { data: tenant } = await serviceClient
      .from("tenants")
      .select("id, name")
      .eq("id", payload.tenantId)
      .maybeSingle();

    if (!tenant) {
      return new Response(
        JSON.stringify({ error: "Tenant not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Execute action
    let result: { success: boolean; error?: string; requiresConfirmation?: boolean };

    switch (payload.action) {
      case "extend-trial":
        if (!payload.days || payload.days < 1) {
          return new Response(
            JSON.stringify({ error: "Invalid days value (minimum 1)" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await extendTrial(serviceClient, payload.tenantId, payload.days, payload.reason, userId);
        break;

      case "mark-as-paid":
        if (!payload.untilDate) {
          return new Response(
            JSON.stringify({ error: "untilDate is required for mark-as-paid action" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await markAsPaid(serviceClient, payload.tenantId, payload.untilDate, payload.reason, userId);
        break;

      case "block-tenant":
        result = await blockTenant(serviceClient, payload.tenantId, payload.reason, userId, !!payload.confirmBlock);
        break;

      case "unblock-tenant":
        result = await unblockTenant(serviceClient, payload.tenantId, payload.reason, userId);
        break;

      case "reset-to-stripe":
        result = await resetToStripe(serviceClient, payload.tenantId, payload.reason, userId);
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${payload.action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    if (!result.success) {
      const status = result.requiresConfirmation ? 409 : 400;
      return new Response(
        JSON.stringify({ error: result.error, requiresConfirmation: result.requiresConfirmation }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Action '${payload.action}' completed successfully for tenant ${tenant.name}` 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Admin billing control error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
