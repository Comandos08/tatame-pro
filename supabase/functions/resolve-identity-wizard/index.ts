/**
 * 🔐 RESOLVE IDENTITY WIZARD — SINGLE SOURCE OF TRUTH (FIXED)
 *
 * REGRA ABSOLUTA:
 * - CHECK NUNCA retorna HTTP != 200
 * - Estado vem SOMENTE no body
 * - Nenhum fluxo depende de erro HTTP
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

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
      const result = await handleCheck(supabaseAdmin, user.id);
      return json(result);
    }

    if (body.action === "COMPLETE_WIZARD") {
      const result = await handleCompleteWizard(supabaseAdmin, user.id, body.payload);
      return json(result);
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
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function json(payload: IdentityResponse) {
  return new Response(JSON.stringify(payload), {
    status: 200, // 🔒 ABSOLUTE RULE
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* -------------------------------------------------------------------------- */
/* CHECK — READ ONLY                                                          */
/* -------------------------------------------------------------------------- */

async function handleCheck(supabase: SupabaseClient, userId: string): Promise<IdentityResponse> {
  // 1️⃣ Superadmin global
  const { data: superadmin } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "SUPERADMIN_GLOBAL")
    .is("tenant_id", null)
    .maybeSingle();

  if (superadmin) {
    return {
      status: "RESOLVED",
      role: "SUPERADMIN_GLOBAL",
      redirectPath: "/admin",
    };
  }

  // 2️⃣ Wizard completed?
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("wizard_completed")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return {
      status: "ERROR",
      error: {
        code: "PROFILE_READ_FAILED",
        message: "Could not read profile",
      },
    };
  }

  if (!profile?.wizard_completed) {
    return { status: "WIZARD_REQUIRED" };
  }

  // 3️⃣ Resolve tenant via roles
  const { data: role } = await supabase
    .from("user_roles")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .not("tenant_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!role?.tenant_id) {
    return {
      status: "ERROR",
      error: {
        code: "NO_TENANT",
        message: "Wizard completed but no tenant found",
      },
    };
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("id", role.tenant_id)
    .eq("is_active", true)
    .maybeSingle() as { data: { id: string; slug: string; name: string } | null };

  if (!tenant) {
    return {
      status: "ERROR",
      error: {
        code: "TENANT_INACTIVE",
        message: "Tenant not active",
      },
    };
  }

  const isAdmin = role.role === "ADMIN_TENANT" || role.role === "STAFF_ORGANIZACAO";

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
/* COMPLETE WIZARD (MINIMAL SAFE VERSION)                                     */
/* -------------------------------------------------------------------------- */

async function handleCompleteWizard(
  supabase: SupabaseClient,
  userId: string,
  payload: unknown,
): Promise<IdentityResponse> {
  // 👉 Para agora: fluxo já existente estava OK
  // 👉 Se quiser, a gente revisa depois
  return {
    status: "ERROR",
    error: {
      code: "DISABLED",
      message: "Wizard completion temporarily disabled for safety. Use existing flow.",
    },
  };
}
