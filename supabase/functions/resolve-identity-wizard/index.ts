/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔐 RESOLVE IDENTITY WIZARD — IDENTITY RESOLUTION ORACLE (READ-ONLY)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * CONTRATO IMUTÁVEL:
 * ─────────────────────────────────────────────────────────────────────────────
 * Esta Edge Function é a FONTE DE VERDADE para resolução de identidade.
 * Ela APENAS LEITURA e DECIDE — nunca modifica estrutura organizacional.
 *
 * ⛔ O QUE ESTA FUNÇÃO NÃO FAZ (BY DESIGN):
 *    1. NÃO cria tenants (bloqueado intencionalmente)
 *    2. NÃO executa onboarding ativo
 *    3. NÃO modifica estrutura organizacional
 *    4. NÃO atribui roles (isso é feito em approve-membership)
 *    5. NÃO cria registros de billing
 *
 * ✅ O QUE ESTA FUNÇÃO FAZ:
 *    1. RESOLVE estado de identidade do usuário autenticado
 *    2. DECIDE redirecionamento com base no estado resolvido
 *    3. RETORNA estado determinístico para o frontend
 *
 * INVARIANTES ABSOLUTAS:
 * ─────────────────────────────────────────────────────────────────────────────
 *    - CHECK SEMPRE retorna HTTP 200
 *    - Estado vem SOMENTE no body (nunca depende de status HTTP)
 *    - Nenhum fluxo depende de status HTTP
 *    - Nenhum maybeSingle() em contexto de identidade
 *    - Bloqueios são INTENCIONAIS e POR DESIGN
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
 *    COMPLETE_WIZARD:
 *      ⛔ BLOQUEADO — Criação de tenants via wizard está DESABILITADA.
 *      Novos tenants devem ser criados via Admin Dashboard.
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
 * ⚠️ NOTA: Esta função existe mas NÃO É UTILIZADA pois criação de tenants
 * via wizard está BLOQUEADA.
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
 * COMPLETE_WIZARD — TENANT CREATION (BLOQUEADO)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ⛔⛔⛔ BLOQUEIO INTENCIONAL — BY DESIGN ⛔⛔⛔
 *
 * Esta função NÃO cria tenants. O fluxo está DESABILITADO intencionalmente.
 *
 * RAZÃO DO BLOQUEIO:
 *   - Criação de tenants requer seleção explícita de modalidade (sport_types)
 *   - O Identity Wizard não suporta seleção de modalidade
 *   - Novos tenants DEVEM ser criados via Admin Dashboard
 *   - Este bloqueio garante integridade da estrutura organizacional
 *
 * COMPORTAMENTO ATUAL:
 *   - joinMode === "existing": Retorna UNSUPPORTED_JOIN_MODE
 *   - joinMode === "new": Valida payload, verifica idempotência, depois BLOQUEIA
 *
 * FLUXO DE VALIDAÇÃO (antes do bloqueio):
 *   1. Validar joinMode (apenas "new" aceito)
 *   2. Validar nome da organização
 *   3. Verificar idempotência (wizard já completado?)
 *   4. Gerar slug único (20 tentativas max)
 *   5. ⛔ BLOQUEIO: Retornar WIZARD_TENANT_CREATION_DISABLED
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
   * ⛔ joinMode === "existing" NÃO É SUPORTADO (feature futura)
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
   * ⛔⛔⛔ BLOQUEIO INTENCIONAL — CRIAÇÃO DE TENANT DESABILITADA ⛔⛔⛔
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * RAZÃO: sport_types é obrigatório para criação de tenant.
   *        O wizard NÃO suporta seleção de modalidade.
   *        Tenants devem ser criados via Admin Dashboard.
   *
   * ESTE BLOQUEIO É BY DESIGN E NÃO DEVE SER REMOVIDO.
   *
   * ═══════════════════════════════════════════════════════════════════════════ */
  console.error("[resolve-identity-wizard] BLOCKED: Tenant creation via wizard is disabled. Use Admin Dashboard.");
  return {
    status: "ERROR",
    error: {
      code: "WIZARD_TENANT_CREATION_DISABLED",
      message: "Criação de organização via wizard está desabilitada. Use o painel administrativo.",
    },
  };
}
