/**
 * 🔐 RESOLVE IDENTITY WIZARD — SINGLE SOURCE OF TRUTH (STABLE)
 *
 * REGRAS ABSOLUTAS:
 * - CHECK SEMPRE retorna HTTP 200
 * - Estado vem SOMENTE no body
 * - Nenhum fluxo depende de status HTTP
 * - Nenhum maybeSingle() em contexto de identidade
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/* -------------------------------------------------------------------------- */
/* CORS                                                                       */
/* -------------------------------------------------------------------------- */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

type Action = "CHECK" | "COMPLETE_WIZARD";

type RequestPayload =
  | { action: "CHECK" }
  | {
      action: "COMPLETE_WIZARD";
      payload: {
        joinMode: "existing" | "new";
        inviteCode?: string;
        newOrgName?: string;
        profileType: "admin" | "athlete";
      };
    };

type IdentityStatus = "RESOLVED" | "WIZARD_REQUIRED" | "ERROR";

interface IdentityResponse {
  status: IdentityStatus;
  role?: "SUPERADMIN_GLOBAL" | "ADMIN_TENANT" | "ATHLETE";
  tenant?: { id: string; slug: string; name: string };
  redirectPath?: string;
  error?: { code: string; message: string };
}

/* -------------------------------------------------------------------------- */
/* ENTRYPOINT                                                                 */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({
        status: "ERROR",
        error: { code: "UNAUTHORIZED", message: "Missing token" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 🔒 Client with USER JWT (auth validation only)
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 🔒 Service client (identity resolution)
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();

    if (userError || !user?.id) {
      return json({
        status: "ERROR",
        error: { code: "INVALID_TOKEN", message: "Invalid session" },
      });
    }

    const body: RequestPayload = await req.json();

    if (body.action === "CHECK") {
      return json(await handleCheck(supabaseAdmin, user.id));
    }

if (body.action === "COMPLETE_WIZARD") {
      try {
        const result = await handleCompleteWizard(supabaseAdmin, user.id, body.payload);
        return json(result);
      } catch (err) {
        console.error("[resolve-identity-wizard] COMPLETE_WIZARD unexpected error:", err);
        return json({
          status: "ERROR",
          error: { code: "UNEXPECTED", message: "Erro inesperado ao completar wizard." },
        });
      }
    }

    return json({
      status: "ERROR",
      error: { code: "INVALID_ACTION", message: "Invalid action" },
    });
  } catch (err) {
    console.error("[resolve-identity-wizard]", err);
    return json({
      status: "ERROR",
      error: { code: "INTERNAL", message: "Unexpected error" },
    });
  }
});

/* -------------------------------------------------------------------------- */
/* RESPONSE HELPER                                                            */
/* -------------------------------------------------------------------------- */

function json(payload: IdentityResponse) {
  return new Response(JSON.stringify(payload), {
    status: 200, // 🔒 ABSOLUTE RULE
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* -------------------------------------------------------------------------- */
/* CHECK — READ ONLY, DETERMINISTIC                                           */
/* -------------------------------------------------------------------------- */

async function handleCheck(supabase: SupabaseClient, userId: string): Promise<IdentityResponse> {
  /* 1️⃣ SUPERADMIN GLOBAL */
  const { data: superadminRoles } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "SUPERADMIN_GLOBAL")
    .is("tenant_id", null)
    .limit(1);

  if (superadminRoles && superadminRoles.length > 0) {
    return {
      status: "RESOLVED",
      role: "SUPERADMIN_GLOBAL",
      redirectPath: "/admin",
    };
  }

  /* 2️⃣ WIZARD COMPLETED? */
  const { data: profile } = await supabase.from("profiles").select("wizard_completed").eq("id", userId).limit(1);

  const wizardCompleted = profile?.[0]?.wizard_completed === true;

  if (!wizardCompleted) {
    return { status: "WIZARD_REQUIRED" };
  }

  /* 3️⃣ RESOLVE ROLE + TENANT (NO maybeSingle) */
  const { data: roles } = await supabase
    .from("user_roles")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .not("tenant_id", "is", null)
    .limit(1);

  const roleRecord = roles?.[0];

  if (!roleRecord?.tenant_id) {
    return {
      status: "ERROR",
      error: {
        code: "NO_TENANT",
        message: "Wizard completed but no tenant found",
      },
    };
  }

  /* 4️⃣ FETCH TENANT */
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("id", roleRecord.tenant_id)
    .eq("is_active", true)
    .limit(1);

  const tenant = tenants?.[0];

  if (!tenant) {
    return {
      status: "ERROR",
      error: {
        code: "TENANT_INACTIVE",
        message: "Tenant not active or not found",
      },
    };
  }

  const isAdmin = roleRecord.role === "ADMIN_TENANT" || roleRecord.role === "STAFF_ORGANIZACAO";

  return {
    status: "RESOLVED",
    role: isAdmin ? "ADMIN_TENANT" : "ATHLETE",
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
    },
    redirectPath: isAdmin ? `/${tenant.slug}/app` : `/${tenant.slug}/portal`,
  };
}

/* -------------------------------------------------------------------------- */
/* SLUG GENERATOR                                                             */
/* -------------------------------------------------------------------------- */

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, 48);
}

/* -------------------------------------------------------------------------- */
/* COMPLETE_WIZARD — NEW ORGANIZATION CREATION                                */
/* -------------------------------------------------------------------------- */

/**
 * Handles COMPLETE_WIZARD action for new organization creation.
 *
 * ⛔ IMPORTANT: joinMode === "existing" is intentionally NOT implemented.
 * This feature will be addressed in a future phase. Any attempt to use it
 * returns ERROR with code UNSUPPORTED_JOIN_MODE.
 *
 * Do NOT implement invite-based join in this PI.
 */
async function handleCompleteWizard(
  supabase: SupabaseClient,
  userId: string,
  payload: any
): Promise<IdentityResponse> {
  console.log("[resolve-identity-wizard] COMPLETE_WIZARD started:", { userId, joinMode: payload?.joinMode });

  /* 1️⃣ VALIDATE joinMode */
  // ⛔ joinMode === "existing" is intentionally NOT implemented.
  // This feature will be addressed in a future phase.
  // For now, only "new" organization creation is supported.
  if (payload?.joinMode !== "new") {
    console.warn("[resolve-identity-wizard] UNSUPPORTED_JOIN_MODE:", payload?.joinMode);
    return {
      status: "ERROR",
      error: {
        code: "UNSUPPORTED_JOIN_MODE",
        message: "Only 'new' organization mode is supported.",
      },
    };
  }

  /* 2️⃣ VALIDATE newOrgName */
  const orgName = payload?.newOrgName?.trim();
  if (!orgName || orgName.length < 3) {
    console.warn("[resolve-identity-wizard] INVALID_PAYLOAD: newOrgName missing or too short");
    return {
      status: "ERROR",
      error: {
        code: "INVALID_PAYLOAD",
        message: "Organization name must be at least 3 characters.",
      },
    };
  }

  /* 3️⃣ IDEMPOTENCE CHECK */
  const { data: profile } = await supabase
    .from("profiles")
    .select("wizard_completed, tenant_id")
    .eq("id", userId)
    .limit(1);

  if (profile?.[0]?.wizard_completed === true && profile?.[0]?.tenant_id) {
    // Already completed - fetch existing tenant and return RESOLVED
    const { data: existingTenant } = await supabase
      .from("tenants")
      .select("id, slug, name")
      .eq("id", profile[0].tenant_id)
      .limit(1);

    if (existingTenant?.[0]) {
      console.log("[resolve-identity-wizard] IDEMPOTENT: Wizard already completed, returning existing tenant");
      return {
        status: "RESOLVED",
        role: "ADMIN_TENANT",
        tenant: existingTenant[0],
        redirectPath: `/${existingTenant[0].slug}/app`,
      };
    }
  }

  /* 4️⃣ GENERATE UNIQUE SLUG */
  const baseSlug = generateSlug(orgName);
  let finalSlug = baseSlug;

  for (let i = 1; i <= 20; i++) {
    const { data: existing } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", finalSlug)
      .limit(1);

    if (!existing || existing.length === 0) {
      break; // Slug is unique
    }

    if (i === 20) {
      console.error("[resolve-identity-wizard] SLUG_CONFLICT: Could not generate unique slug after 20 attempts");
      return {
        status: "ERROR",
        error: { code: "SLUG_CONFLICT", message: "Could not generate unique slug." },
      };
    }

    finalSlug = `${baseSlug}-${i + 1}`;
  }

  /* 5️⃣ CREATE TENANT */
  const { data: newTenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({
      name: orgName,
      slug: finalSlug,
      onboarding_completed: false,
      sport_types: ["BJJ"],
    })
    .select("id, slug, name")
    .single();

  if (tenantError || !newTenant) {
    console.error("[resolve-identity-wizard] TENANT_CREATE_FAILED:", tenantError);
    return {
      status: "ERROR",
      error: { code: "TENANT_CREATE_FAILED", message: "Failed to create organization." },
    };
  }

  /* 6️⃣ CREATE ROLE (ADMIN_TENANT) */
  const { error: roleError } = await supabase.from("user_roles").insert({
    user_id: userId,
    role: "ADMIN_TENANT",
    tenant_id: newTenant.id,
  });

  if (roleError) {
    console.error("[resolve-identity-wizard] ROLE_CREATE_FAILED:", roleError);
    // Rollback: delete tenant
    await supabase.from("tenants").delete().eq("id", newTenant.id);
    return {
      status: "ERROR",
      error: { code: "ROLE_CREATE_FAILED", message: "Failed to assign admin role." },
    };
  }

  /* 7️⃣ UPDATE PROFILE */
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      wizard_completed: true,
      tenant_id: newTenant.id,
    })
    .eq("id", userId);

  if (profileError) {
    console.error("[resolve-identity-wizard] PROFILE_UPDATE_FAILED:", profileError);
    return {
      status: "ERROR",
      error: { code: "PROFILE_UPDATE_FAILED", message: "Failed to update profile." },
    };
  }

  /* 8️⃣ BILLING TRIAL (BEST-EFFORT) */
  // 🔔 BILLING IS BEST-EFFORT FOR P0
  // If billing creation fails, we log a warning but do NOT abort the flow.
  // The user can still complete onboarding. Billing will be addressed separately.
  try {
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const { error: billingError } = await supabase.from("tenant_billing").insert({
      tenant_id: newTenant.id,
      status: "TRIALING",
      plan_name: "Trial",
      plan_price_id: "trial_placeholder",
      current_period_start: now.toISOString(),
      current_period_end: trialEnd.toISOString(),
      trial_started_at: now.toISOString(),
      trial_expires_at: trialEnd.toISOString(),
    });

    if (billingError) {
      console.warn("[resolve-identity-wizard] BILLING_CREATE_WARNING (non-blocking):", billingError);
      // Continue - billing does not block P0 onboarding
    }
  } catch (billingErr) {
    console.warn("[resolve-identity-wizard] BILLING_CREATE_EXCEPTION (non-blocking):", billingErr);
    // Continue - billing does not block P0 onboarding
  }

  /* 9️⃣ RETURN RESOLVED */
  console.log("[resolve-identity-wizard] COMPLETE_WIZARD success:", {
    userId,
    tenantId: newTenant.id,
    slug: newTenant.slug,
  });

  return {
    status: "RESOLVED",
    role: "ADMIN_TENANT",
    tenant: {
      id: newTenant.id,
      slug: newTenant.slug,
      name: newTenant.name,
    },
    redirectPath: `/${newTenant.slug}/app`,
  };
}
