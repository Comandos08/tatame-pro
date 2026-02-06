/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔐 RESOLVE IDENTITY WIZARD — IDENTITY RESOLUTION & WIZARD COMPLETION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * CONTRATO:
 * ─────────────────────────────────────────────────────────────────────────────
 * Esta Edge Function é a FONTE DE VERDADE para resolução de identidade.
 *
 * ✅ O QUE ESTA FUNÇÃO FAZ:
 *    1. CHECK: Resolve estado de identidade do usuário autenticado
 *    2. COMPLETE_WIZARD: Cria tenant em status=SETUP + atribui ADMIN_TENANT
 *
 * ⛔ O QUE ESTA FUNÇÃO NÃO FAZ (BY DESIGN):
 *    1. NÃO executa lógica de billing (tenant em SETUP não tem billing)
 *    2. NÃO envia convites automáticos
 *    3. NÃO libera features de produção para tenants em SETUP
 *    4. NÃO atribui permissões globais (apenas ADMIN do tenant criado)
 *
 * INVARIANTES ABSOLUTAS:
 * ─────────────────────────────────────────────────────────────────────────────
 *    - CHECK SEMPRE retorna HTTP 200
 *    - Estado vem SOMENTE no body (nunca depende de status HTTP)
 *    - Nenhum fluxo depende de status HTTP
 *    - Nenhum maybeSingle() em contexto de identidade
 *
 * ESTADOS POSSÍVEIS:
 * ─────────────────────────────────────────────────────────────────────────────
 *    - RESOLVED: Identidade resolvida com role e tenant
 *    - WIZARD_REQUIRED: Usuário precisa completar wizard
 *    - ERROR: Falha recuperável (com código específico)
 *
 * FLUXO DE DECISÃO:
 * ─────────────────────────────────────────────────────────────────────────────
 *    CHECK:
 *      1. SUPERADMIN_GLOBAL? → RESOLVED + /admin
 *      2. wizard_completed = false? → WIZARD_REQUIRED
 *      3. Tem role+tenant ativo? → RESOLVED + /{slug}/app ou /{slug}/portal
 *      4. Fallback → ERROR
 *
 *    COMPLETE_WIZARD (joinMode = "new"):
 *      1. Valida payload
 *      2. Verifica idempotência (wizard já completado?)
 *      3. Gera slug único
 *      4. Cria tenant com status=SETUP, creation_source=wizard
 *      5. Atribui role ADMIN_TENANT ao usuário criador
 *      6. Marca wizard_completed = true
 *      7. Retorna RESOLVED + /{slug}/app/onboarding
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/* ═══════════════════════════════════════════════════════════════════════════════
 * CORS HEADERS
 * ═══════════════════════════════════════════════════════════════════════════════ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ═══════════════════════════════════════════════════════════════════════════════
 * TYPE DEFINITIONS
 * ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * Ações suportadas pela função.
 * - CHECK: Resolução de identidade (read-only)
 * - COMPLETE_WIZARD: Tentativa de completar wizard (bloqueada para criação de tenants)
 */
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

/**
 * Estados de identidade retornados.
 * - RESOLVED: Identidade completa, pode redirecionar
 * - WIZARD_REQUIRED: Precisa completar wizard
 * - ERROR: Falha com código específico
 */
type IdentityStatus = "RESOLVED" | "WIZARD_REQUIRED" | "ERROR";

interface IdentityResponse {
  status: IdentityStatus;
  role?: "SUPERADMIN_GLOBAL" | "ADMIN_TENANT" | "ATHLETE";
  tenant?: { id: string; slug: string; name: string };
  redirectPath?: string;
  error?: { code: string; message: string };
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * ENTRYPOINT — REQUEST ROUTER
 * ═══════════════════════════════════════════════════════════════════════════════ */

Deno.serve(async (req) => {
  /* ───────────────────────────────────────────────────────────────────────────
   * CORS PREFLIGHT
   * ─────────────────────────────────────────────────────────────────────────── */
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    /* ─────────────────────────────────────────────────────────────────────────
     * VALIDAÇÃO DE AUTENTICAÇÃO
     * ───────────────────────────────────────────────────────────────────────── */
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({
        status: "ERROR",
        error: { code: "UNAUTHORIZED", message: "Missing token" },
      });
    }

    /* ─────────────────────────────────────────────────────────────────────────
     * INICIALIZAÇÃO DE CLIENTES SUPABASE
     * ───────────────────────────────────────────────────────────────────────── */
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 🔒 Client com JWT do usuário (apenas para validação de auth)
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 🔒 Service client (para resolução de identidade)
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    /* ─────────────────────────────────────────────────────────────────────────
     * VALIDAÇÃO DE USUÁRIO
     * ───────────────────────────────────────────────────────────────────────── */
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

    /* ─────────────────────────────────────────────────────────────────────────
     * ROTEAMENTO DE AÇÃO
     * ───────────────────────────────────────────────────────────────────────── */
    const body: RequestPayload = await req.json();

    if (body.action === "CHECK") {
      // ✅ CHECK: Resolução de identidade (read-only)
      return json(await handleIdentityCheck(supabaseAdmin, user.id));
    }

    if (body.action === "COMPLETE_WIZARD") {
      // ⛔ COMPLETE_WIZARD: Bloqueado para criação de tenants
      try {
        const result = await handleWizardCompletion(supabaseAdmin, user.id, body.payload);
        return json(result);
      } catch (err) {
        console.error("[resolve-identity-wizard] COMPLETE_WIZARD unexpected error:", err);
        return json({
          status: "ERROR",
          error: { code: "UNEXPECTED", message: "Erro inesperado ao completar wizard." },
        });
      }
    }

    /* ─────────────────────────────────────────────────────────────────────────
     * AÇÃO INVÁLIDA
     * ───────────────────────────────────────────────────────────────────────── */
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

/* ═══════════════════════════════════════════════════════════════════════════════
 * RESPONSE HELPER
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔒 REGRA ABSOLUTA: Sempre retorna HTTP 200.
 * O estado é comunicado SOMENTE via body.status.
 * ═══════════════════════════════════════════════════════════════════════════════ */

function json(payload: IdentityResponse) {
  return new Response(JSON.stringify(payload), {
    status: 200, // 🔒 INVARIANTE ABSOLUTA — Nunca alterar
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * CHECK — IDENTITY RESOLUTION (READ-ONLY)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Resolve o estado de identidade do usuário de forma determinística.
 * Esta função é PURAMENTE LEITURA — não modifica nenhum dado.
 *
 * ORDEM DE AVALIAÇÃO (prioritária):
 *   1. SUPERADMIN_GLOBAL → RESOLVED + /admin
 *   2. wizard_completed = false → WIZARD_REQUIRED
 *   3. Tem role + tenant ativo → RESOLVED + redirect path
 *   4. Fallback → ERROR
 * ═══════════════════════════════════════════════════════════════════════════════ */

async function handleIdentityCheck(supabase: SupabaseClient, userId: string): Promise<IdentityResponse> {
  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 1: VERIFICAR SUPERADMIN GLOBAL
   * ───────────────────────────────────────────────────────────────────────────── */
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

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 2: VERIFICAR SE WIZARD FOI COMPLETADO
   * ───────────────────────────────────────────────────────────────────────────── */
  const { data: profileData } = await supabase
    .from("profiles")
    .select("wizard_completed")
    .eq("id", userId)
    .limit(1);

  const wizardCompleted = profileData?.[0]?.wizard_completed === true;

  if (!wizardCompleted) {
    return { status: "WIZARD_REQUIRED" };
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 3: RESOLVER ROLE + TENANT
   * 🔒 NÃO usar maybeSingle() — padrão de segurança
   * ───────────────────────────────────────────────────────────────────────────── */
  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .not("tenant_id", "is", null)
    .limit(1);

  const roleRecord = userRoles?.[0];

  if (!roleRecord?.tenant_id) {
    return {
      status: "ERROR",
      error: {
        code: "NO_TENANT",
        message: "Wizard completed but no tenant found",
      },
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 4: BUSCAR DADOS DO TENANT
   * ───────────────────────────────────────────────────────────────────────────── */
  const { data: tenantData } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("id", roleRecord.tenant_id)
    .eq("is_active", true)
    .limit(1);

  const tenant = tenantData?.[0];

  if (!tenant) {
    return {
      status: "ERROR",
      error: {
        code: "TENANT_INACTIVE",
        message: "Tenant not active or not found",
      },
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 5: DECISÃO DE REDIRECIONAMENTO
   * ───────────────────────────────────────────────────────────────────────────── */
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

/* ═══════════════════════════════════════════════════════════════════════════════
 * SLUG GENERATOR (UTILITY)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Gera slug URL-safe a partir de nome.
 * ═══════════════════════════════════════════════════════════════════════════════ */

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, 48);
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * COMPLETE_WIZARD — TENANT CREATION (SETUP MODE)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * P2.HOTFIX — Cria tenant via Wizard em modo SETUP
 *
 * REGRAS:
 *   1. Apenas joinMode === "new" é suportado
 *   2. Tenant é criado com status = 'SETUP', creation_source = 'wizard'
 *   3. Usuário recebe APENAS role ADMIN_TENANT do tenant criado
 *   4. Nenhuma lógica de billing é executada
 *   5. Nenhum convite automático é enviado
 *   6. Usuário é redirecionado para /{slug}/app/onboarding
 *
 * SEGURANÇA:
 *   - Tenant em SETUP não aparece em listagens públicas (is_active = true, mas status = SETUP)
 *   - Billing não é criado até onboarding ser completado
 *   - Operações destrutivas são bloqueadas até tenant estar ACTIVE
 *
 * ═══════════════════════════════════════════════════════════════════════════════ */

async function handleWizardCompletion(
  supabase: SupabaseClient,
  userId: string,
  payload: any
): Promise<IdentityResponse> {
  console.log("[resolve-identity-wizard] COMPLETE_WIZARD started:", { userId, joinMode: payload?.joinMode });

  /* ─────────────────────────────────────────────────────────────────────────────
   * VALIDAÇÃO 1: joinMode
   * Apenas joinMode === "new" é suportado (criar nova organização)
   * ───────────────────────────────────────────────────────────────────────────── */
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

  /* ─────────────────────────────────────────────────────────────────────────────
   * VALIDAÇÃO 2: Nome da organização
   * ───────────────────────────────────────────────────────────────────────────── */
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

  /* ─────────────────────────────────────────────────────────────────────────────
   * VALIDAÇÃO 3: Idempotência
   * Se wizard já foi completado, retornar tenant existente
   * ───────────────────────────────────────────────────────────────────────────── */
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("wizard_completed, tenant_id")
    .eq("id", userId)
    .limit(1);

  if (existingProfile?.[0]?.wizard_completed === true && existingProfile?.[0]?.tenant_id) {
    // ✅ Idempotente: Wizard já completado, retornar tenant existente
    const { data: existingTenantData } = await supabase
      .from("tenants")
      .select("id, slug, name")
      .eq("id", existingProfile[0].tenant_id)
      .limit(1);

    if (existingTenantData?.[0]) {
      console.log("[resolve-identity-wizard] IDEMPOTENT: Wizard already completed, returning existing tenant");
      return {
        status: "RESOLVED",
        role: "ADMIN_TENANT",
        tenant: existingTenantData[0],
        redirectPath: `/${existingTenantData[0].slug}/app`,
      };
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * VALIDAÇÃO 4: Geração de slug único
   * Tenta até 20 variações para evitar colisão
   * ───────────────────────────────────────────────────────────────────────────── */
  const baseSlug = generateSlug(orgName);
  let finalSlug = baseSlug;

  for (let attemptIndex = 1; attemptIndex <= 20; attemptIndex++) {
    const { data: existingSlug } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", finalSlug)
      .limit(1);

    if (!existingSlug || existingSlug.length === 0) {
      break; // Slug é único, pode prosseguir
    }

    if (attemptIndex === 20) {
      console.error("[resolve-identity-wizard] SLUG_CONFLICT: Could not generate unique slug after 20 attempts");
      return {
        status: "ERROR",
        error: { code: "SLUG_CONFLICT", message: "Could not generate unique slug." },
      };
    }

    finalSlug = `${baseSlug}-${attemptIndex + 1}`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * ✅ P2.HOTFIX — CRIAR TENANT EM MODO SETUP
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * 1. Cria tenant com status=SETUP, creation_source=wizard
   * 2. sport_types vazio (será definido no onboarding)
   * 3. is_active=true para permitir acesso do admin criador
   * 4. onboarding_completed=false (obriga wizard de setup)
   *
   * ═══════════════════════════════════════════════════════════════════════════ */
  console.log("[resolve-identity-wizard] Creating tenant in SETUP mode:", { orgName, finalSlug });

  const { data: newTenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({
      name: orgName,
      slug: finalSlug,
      is_active: true,
      status: "SETUP",
      creation_source: "wizard",
      onboarding_completed: false,
      sport_types: [], // Será definido no onboarding - trigger validação desabilitado para SETUP
    })
    .select("id, slug, name")
    .single();

  if (tenantError || !newTenant) {
    console.error("[resolve-identity-wizard] Failed to create tenant:", tenantError);
    
    // Check for specific constraint violation (sport_types)
    if (tenantError?.message?.includes("sport_types")) {
      return {
        status: "ERROR",
        error: {
          code: "VALIDATION_ERROR",
          message: "Falha na validação: modalidade esportiva será definida no próximo passo.",
        },
      };
    }
    
    return {
      status: "ERROR",
      error: {
        code: "TENANT_CREATION_FAILED",
        message: tenantError?.message || "Falha ao criar organização.",
      },
    };
  }

  console.log("[resolve-identity-wizard] Tenant created successfully:", newTenant.id);

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 5: Atribuir role ADMIN_TENANT ao usuário criador
   * ───────────────────────────────────────────────────────────────────────────── */
  const { error: roleError } = await supabase.from("user_roles").insert({
    user_id: userId,
    role: "ADMIN_TENANT",
    tenant_id: newTenant.id,
  });

  if (roleError) {
    console.error("[resolve-identity-wizard] Failed to assign role:", roleError);
    // Rollback tenant creation
    await supabase.from("tenants").delete().eq("id", newTenant.id);
    return {
      status: "ERROR",
      error: {
        code: "ROLE_ASSIGNMENT_FAILED",
        message: "Falha ao atribuir permissão de administrador.",
      },
    };
  }

  console.log("[resolve-identity-wizard] ADMIN_TENANT role assigned to user:", userId);

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 6: Atualizar profile com wizard_completed e tenant_id
   * ───────────────────────────────────────────────────────────────────────────── */
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      wizard_completed: true,
      tenant_id: newTenant.id,
    })
    .eq("id", userId);

  if (profileError) {
    console.error("[resolve-identity-wizard] Failed to update profile:", profileError);
    // Continue anyway - wizard_completed can be set later
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 7: Log audit event
   * ───────────────────────────────────────────────────────────────────────────── */
  await supabase.from("audit_logs").insert({
    tenant_id: newTenant.id,
    profile_id: userId,
    event_type: "TENANT_CREATED_VIA_WIZARD",
    metadata: {
      tenant_name: orgName,
      tenant_slug: finalSlug,
      creation_source: "wizard",
      status: "SETUP",
    },
  });

  console.log("[resolve-identity-wizard] COMPLETE_WIZARD success - redirecting to onboarding");

  /* ─────────────────────────────────────────────────────────────────────────────
   * RETORNO: RESOLVED com redirecionamento para onboarding
   * ───────────────────────────────────────────────────────────────────────────── */
  return {
    status: "RESOLVED",
    role: "ADMIN_TENANT",
    tenant: {
      id: newTenant.id,
      slug: newTenant.slug,
      name: newTenant.name,
    },
    redirectPath: `/${newTenant.slug}/app/onboarding`,
  };
}
