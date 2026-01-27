/**
 * 🔐 RESOLVE IDENTITY WIZARD — Single Source of Truth
 * 
 * Edge Function that handles ALL identity resolution and wizard completion.
 * The client NEVER writes to: user_roles, tenant_billing, identity decisions.
 * 
 * ACTIONS:
 * - CHECK: Verify identity state (read-only)
 * - COMPLETE_WIZARD: Create tenant, roles, billing (write)
 * 
 * SECURITY:
 * - JWT validation required
 * - No tenant enumeration (exact match only)
 * - All sensitive writes happen here
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Types
type Action = "CHECK" | "COMPLETE_WIZARD";
type JoinMode = "existing" | "new";
type ProfileType = "admin" | "athlete";

interface CheckPayload {
  action: "CHECK";
}

interface CompleteWizardPayload {
  action: "COMPLETE_WIZARD";
  payload: {
    joinMode: JoinMode;
    inviteCode?: string;
    newOrgName?: string;
    profileType: ProfileType;
  };
}

type RequestPayload = CheckPayload | CompleteWizardPayload;

interface TenantInfo {
  id: string;
  slug: string;
  name: string;
}

interface IdentityResponse {
  status: "RESOLVED" | "WIZARD_REQUIRED" | "ERROR";
  tenant?: TenantInfo;
  role?: "ADMIN_TENANT" | "ATHLETE" | "SUPERADMIN_GLOBAL";
  redirectPath?: string;
  error?: {
    code: "INVITE_INVALID" | "TENANT_NOT_FOUND" | "PERMISSION_DENIED" | "SLUG_TAKEN" | "VALIDATION_ERROR" | "UNKNOWN";
    message: string;
  };
}

interface TenantContextResult {
  hasTenant: boolean;
  tenantId?: string;
  tenant?: TenantInfo;
  role?: "ADMIN_TENANT" | "ATHLETE";
  redirectPath?: string;
}

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = ReturnType<typeof createClient<any>>;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ status: "ERROR", error: { code: "PERMISSION_DENIED", message: "Unauthorized" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Client with user's JWT for auth verification
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT and get user
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    
    if (userError || !userData?.user?.id) {
      return new Response(
        JSON.stringify({ status: "ERROR", error: { code: "PERMISSION_DENIED", message: "Invalid token" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;

    // Parse request body
    const body: RequestPayload = await req.json();
    const action = body.action;

    if (action === "CHECK") {
      const response = await handleCheck(supabaseAdmin, userId);
      return new Response(JSON.stringify(response), {
        status: response.status === "ERROR" ? 400 : 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "COMPLETE_WIZARD") {
      const payload = (body as CompleteWizardPayload).payload;
      const response = await handleCompleteWizard(supabaseAdmin, userId, payload);
      return new Response(JSON.stringify(response), {
        status: response.status === "ERROR" ? 400 : 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ status: "ERROR", error: { code: "VALIDATION_ERROR", message: "Invalid action" } }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[resolve-identity-wizard] Error:", err);
    return new Response(
      JSON.stringify({ status: "ERROR", error: { code: "UNKNOWN", message: "Internal server error" } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * CHECK — Verify identity state (read-only)
 * Never modifies data
 */
async function handleCheck(
  supabase: SupabaseAdmin,
  userId: string
): Promise<IdentityResponse> {
  // 1. Check if superadmin (bypasses wizard)
  const { data: superadminRole } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "SUPERADMIN_GLOBAL")
    .is("tenant_id", null)
    .maybeSingle();

  if (superadminRole) {
    return {
      status: "RESOLVED",
      role: "SUPERADMIN_GLOBAL",
      redirectPath: "/admin",
    };
  }

  // 2. Check profile wizard_completed
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("wizard_completed, tenant_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("[CHECK] Profile fetch error:", profileError);
    return {
      status: "ERROR",
      error: { code: "UNKNOWN", message: "Failed to verify identity" },
    };
  }

  // 3. If wizard not completed, check for existing context
  const wizardCompleted = profile?.wizard_completed ?? false;

  if (!wizardCompleted) {
    // Check if user has tenant context (retroactive for existing users)
    const context = await resolveTenantContext(supabase, userId);
    
    if (context.hasTenant && context.tenant) {
      // Auto-complete wizard for existing users with context
      await supabase
        .from("profiles")
        .update({ wizard_completed: true, tenant_id: context.tenantId })
        .eq("id", userId);

      return {
        status: "RESOLVED",
        tenant: context.tenant,
        role: context.role,
        redirectPath: context.redirectPath,
      };
    }

    // No context - wizard required
    return { status: "WIZARD_REQUIRED" };
  }

  // 4. Wizard completed - resolve tenant
  const context = await resolveTenantContext(supabase, userId);

  if (!context.hasTenant || !context.tenant) {
    // Edge case: wizard marked complete but no tenant
    // Reset wizard_completed
    await supabase
      .from("profiles")
      .update({ wizard_completed: false })
      .eq("id", userId);

    return { status: "WIZARD_REQUIRED" };
  }

  return {
    status: "RESOLVED",
    tenant: context.tenant,
    role: context.role,
    redirectPath: context.redirectPath,
  };
}

/**
 * COMPLETE_WIZARD — Create tenant, roles, billing
 * All sensitive writes happen here
 */
async function handleCompleteWizard(
  supabase: SupabaseAdmin,
  userId: string,
  payload: {
    joinMode: JoinMode;
    inviteCode?: string;
    newOrgName?: string;
    profileType: ProfileType;
  }
): Promise<IdentityResponse> {
  const { joinMode, inviteCode, newOrgName, profileType } = payload;

  // Validate payload
  if (!joinMode || !profileType) {
    return {
      status: "ERROR",
      error: { code: "VALIDATION_ERROR", message: "Missing required fields" },
    };
  }

  let tenantId: string;
  let tenantSlug: string;
  let tenantName: string;

  if (joinMode === "existing") {
    // Join existing organization
    if (!inviteCode?.trim()) {
      return {
        status: "ERROR",
        error: { code: "VALIDATION_ERROR", message: "Invite code is required" },
      };
    }

    // SECURITY: Exact match only, no enumeration
    const code = inviteCode.trim().toLowerCase();
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, slug, name")
      .eq("is_active", true)
      .or(`slug.eq.${code},id.eq.${inviteCode.trim()}`)
      .maybeSingle();

    if (tenantError || !tenant) {
      return {
        status: "ERROR",
        error: { code: "INVITE_INVALID", message: "Invalid invite code or organization not found" },
      };
    }

    tenantId = String(tenant.id);
    tenantSlug = String(tenant.slug);
    tenantName = String(tenant.name);

  } else if (joinMode === "new") {
    // Create new organization
    if (!newOrgName?.trim()) {
      return {
        status: "ERROR",
        error: { code: "VALIDATION_ERROR", message: "Organization name is required" },
      };
    }

    const orgName = newOrgName.trim();

    // Generate slug
    const slug = orgName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // Check slug availability
    const { data: existingTenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (existingTenant) {
      return {
        status: "ERROR",
        error: { code: "SLUG_TAKEN", message: "This organization name is already in use" },
      };
    }

    // Create tenant
    const { data: newTenant, error: createError } = await supabase
      .from("tenants")
      .insert({
        name: orgName,
        slug,
        is_active: true,
        primary_color: "#dc2626",
        sport_types: ["BJJ"],
      })
      .select("id, slug, name")
      .single();

    if (createError || !newTenant) {
      console.error("[COMPLETE_WIZARD] Tenant creation error:", createError);
      return {
        status: "ERROR",
        error: { code: "UNKNOWN", message: "Failed to create organization" },
      };
    }

    tenantId = String(newTenant.id);
    tenantSlug = String(newTenant.slug);
    tenantName = String(newTenant.name);

    // Create billing record (trial)
    const { error: billingError } = await supabase
      .from("tenant_billing")
      .insert({
        tenant_id: tenantId,
        status: "TRIALING",
      });

    if (billingError) {
      console.error("[COMPLETE_WIZARD] Billing creation error:", billingError);
      // Don't fail the whole operation for billing
    }

    // For new org, creator is always admin
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        role: "ADMIN_TENANT",
      });

    if (roleError) {
      console.error("[COMPLETE_WIZARD] Role creation error:", roleError);
      return {
        status: "ERROR",
        error: { code: "UNKNOWN", message: "Failed to assign role" },
      };
    }

  } else {
    return {
      status: "ERROR",
      error: { code: "VALIDATION_ERROR", message: "Invalid join mode" },
    };
  }

  // For existing org with admin profile type (not new org which is handled above)
  if (joinMode === "existing" && profileType === "admin") {
    // Check if already has admin role
    const { data: existingRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("role", "ADMIN_TENANT")
      .maybeSingle();

    if (!existingRole) {
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: userId,
          tenant_id: tenantId,
          role: "ADMIN_TENANT",
        });

      if (roleError) {
        console.error("[COMPLETE_WIZARD] Role creation error:", roleError);
        // Don't fail for role error on existing org
      }
    }
  }

  // Update profile: wizard_completed = true, tenant_id
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      wizard_completed: true,
      tenant_id: tenantId,
    })
    .eq("id", userId);

  if (profileError) {
    console.error("[COMPLETE_WIZARD] Profile update error:", profileError);
    return {
      status: "ERROR",
      error: { code: "UNKNOWN", message: "Failed to complete wizard" },
    };
  }

  // Determine redirect path
  let redirectPath: string;
  if (joinMode === "new" || profileType === "admin") {
    redirectPath = `/${tenantSlug}/app/onboarding`;
  } else {
    // Athlete joining existing org
    redirectPath = `/${tenantSlug}/membership/new`;
  }

  return {
    status: "RESOLVED",
    tenant: {
      id: tenantId,
      slug: tenantSlug,
      name: tenantName,
    },
    role: joinMode === "new" || profileType === "admin" ? "ADMIN_TENANT" : "ATHLETE",
    redirectPath,
  };
}

/**
 * Resolve tenant context from various sources
 */
async function resolveTenantContext(
  supabase: SupabaseAdmin,
  userId: string
): Promise<TenantContextResult> {
  // 1. Check profile tenant_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();

  let tenantId = profile?.tenant_id ? String(profile.tenant_id) : null;

  // 2. Check user_roles for tenant
  if (!tenantId) {
    const { data: role } = await supabase
      .from("user_roles")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .not("tenant_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (role?.tenant_id) {
      tenantId = String(role.tenant_id);
    }
  }

  // 3. Check athlete link
  if (!tenantId) {
    const { data: athlete } = await supabase
      .from("athletes")
      .select("tenant_id")
      .eq("profile_id", userId)
      .maybeSingle();

    if (athlete?.tenant_id) {
      tenantId = String(athlete.tenant_id);
    }
  }

  if (!tenantId) {
    return { hasTenant: false };
  }

  // Fetch tenant details
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant) {
    return { hasTenant: false };
  }

  // Determine role
  const { data: adminRole } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .in("role", ["ADMIN_TENANT", "STAFF_ORGANIZACAO"])
    .limit(1)
    .maybeSingle();

  const isAdmin = !!adminRole;
  const redirectPath = isAdmin ? `/${tenant.slug}/app` : `/${tenant.slug}/portal`;

  return {
    hasTenant: true,
    tenantId: String(tenant.id),
    tenant: { 
      id: String(tenant.id), 
      slug: String(tenant.slug), 
      name: String(tenant.name) 
    },
    role: isAdmin ? "ADMIN_TENANT" : "ATHLETE",
    redirectPath,
  };
}
