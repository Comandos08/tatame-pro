/**
 * Admin Billing Control Edge Function
 * 
 * SECURITY: Only accessible by SUPERADMIN_GLOBAL users.
 * Provides manual billing overrides for tenant management.
 * 
 * Actions:
 * - extend-trial: Extend tenant trial by X days
 * - mark-as-paid: Mark tenant as paid until a specific date
 * - block-tenant: Force block a tenant
 * - unblock-tenant: Force unblock a tenant
 * 
 * All actions are logged to audit_logs with full before/after state.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Supported actions
type BillingAction = "extend-trial" | "mark-as-paid" | "block-tenant" | "unblock-tenant";

interface RequestPayload {
  action: BillingAction;
  tenantId: string;
  days?: number;       // For extend-trial
  untilDate?: string;  // For mark-as-paid (ISO date)
  reason: string;
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

// Action: Extend Trial
async function extendTrial(
  serviceClient: ReturnType<typeof getServiceClient>,
  tenantId: string,
  days: number,
  reason: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
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
      before: JSON.stringify(before.billing),
      after: JSON.stringify(after.billing),
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
      before: JSON.stringify(before.billing),
      after: JSON.stringify(after.billing),
    },
  });

  return { success: true };
}

// Action: Block Tenant
async function blockTenant(
  serviceClient: ReturnType<typeof getServiceClient>,
  tenantId: string,
  reason: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const before = await getCurrentBillingState(serviceClient, tenantId);
  
  if (!before.billing) {
    return { success: false, error: "Tenant billing record not found" };
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

  const after = await getCurrentBillingState(serviceClient, tenantId);

  await createAuditLog(serviceClient, {
    event_type: "BILLING_OVERRIDE_BLOCK",
    tenant_id: tenantId,
    profile_id: userId,
    metadata: {
      action: "block-tenant",
      reason,
      previous_status: before.billing?.status,
      new_status: "PAST_DUE",
      source: "admin_control_tower",
      before: JSON.stringify(before.billing),
      after: JSON.stringify(after.billing),
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

  const after = await getCurrentBillingState(serviceClient, tenantId);

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
      before: JSON.stringify(before.billing),
      after: JSON.stringify(after.billing),
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
    let result: { success: boolean; error?: string };

    switch (payload.action) {
      case "extend-trial":
        if (!payload.days || payload.days < 1 || payload.days > 365) {
          return new Response(
            JSON.stringify({ error: "Invalid days value (1-365)" }),
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
        result = await blockTenant(serviceClient, payload.tenantId, payload.reason, userId);
        break;

      case "unblock-tenant":
        result = await unblockTenant(serviceClient, payload.tenantId, payload.reason, userId);
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${payload.action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
