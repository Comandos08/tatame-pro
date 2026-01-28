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
      // 🔒 TEMPORARIAMENTE DESABILITADO COM SEGURANÇA
      return json({ status: "WIZARD_REQUIRED" });
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
