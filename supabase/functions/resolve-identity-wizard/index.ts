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
 *    2. CREATE_TENANT: Cria tenant em status=SETUP + atribui ADMIN_TENANT
 *    3. JOIN_EXISTING_TENANT: Valida slug + cria membership PENDING_REVIEW
 *    4. ACCEPT_INVITE: Stub para convites futuros
 *    5. COMPLETE_WIZARD: Compatibilidade temporária (roteia para CREATE ou JOIN)
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
 *    CREATE_TENANT (joinMode = "new"):
 *      1. Valida payload
 *      2. Verifica idempotência (wizard já completado?)
 *      3. Gera slug único
 *      4. Cria tenant com status=SETUP, creation_source=wizard
 *      5. Atribui role ADMIN_TENANT ao usuário criador
 *      6. Marca wizard_completed = true
 *      7. Retorna RESOLVED + /{slug}/app/onboarding
 *
 *    JOIN_EXISTING_TENANT:
 *      1. Valida tenantCode (slug)
 *      2. Busca tenant por slug (case-insensitive)
 *      3. Valida tenant status = ACTIVE
 *      4. Verifica se já existe membership
 *      5. Cria membership PENDING_REVIEW
 *      6. Marca wizard_completed = true (sem setar tenant_id no profile!)
 *      7. Retorna RESOLVED + /{slug}/membership/status
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { emitBillingAuditEvent } from "../_shared/emitBillingAuditEvent.ts";

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
 * - CREATE_TENANT: Criar nova organização
 * - JOIN_EXISTING_TENANT: Entrar em organização existente
 * - ACCEPT_INVITE: Aceitar convite (futuro)
 * - COMPLETE_WIZARD: Compatibilidade temporária
 */
type Action = "CHECK" | "CREATE_TENANT" | "JOIN_EXISTING_TENANT" | "ACCEPT_INVITE" | "COMPLETE_WIZARD";

interface CreateTenantPayload {
  orgName: string;
}

interface JoinExistingTenantPayload {
  tenantCode: string;
}

interface LegacyCompleteWizardPayload {
  joinMode: "existing" | "new";
  inviteCode?: string;
  newOrgName?: string;
  profileType: "admin" | "athlete";
}

type RequestPayload =
  | { action: "CHECK" }
  | { action: "CREATE_TENANT"; payload: CreateTenantPayload }
  | { action: "JOIN_EXISTING_TENANT"; payload: JoinExistingTenantPayload }
  | { action: "ACCEPT_INVITE"; payload: { inviteToken: string } }
  | { action: "COMPLETE_WIZARD"; payload: LegacyCompleteWizardPayload };

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
    const body = await req.json() as RequestPayload;

    switch (body.action) {
      case "CHECK":
        return json(await handleIdentityCheck(supabaseAdmin, user.id));

      case "CREATE_TENANT":
        return json(await handleCreateTenant(supabaseAdmin, user.id, body.payload));

      case "JOIN_EXISTING_TENANT":
        return json(await handleJoinExistingTenant(supabaseAdmin, user.id, body.payload));

      case "ACCEPT_INVITE":
        return json(await handleAcceptInvite(supabaseAdmin, user.id, body.payload));

      case "COMPLETE_WIZARD":
        // ⚠️ COMPATIBILIDADE TEMPORÁRIA — roteia para action correta
        return json(await handleLegacyCompleteWizard(supabaseAdmin, user.id, body.payload));

      default:
        return json({
          status: "ERROR",
          error: { code: "INVALID_ACTION", message: "Invalid action" },
        });
    }
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
    // Usuário com wizard_completed mas sem role: checar se tem membership PENDING
    const { data: pendingMemberships } = await supabase
      .from("memberships")
      .select("id, tenant_id, status")
      .eq("applicant_profile_id", userId)
      .eq("status", "PENDING_REVIEW")
      .limit(1);

    if (pendingMemberships?.[0]) {
      // Buscar tenant para redirect
      const { data: tenantData } = await supabase
        .from("tenants")
        .select("id, slug, name")
        .eq("id", pendingMemberships[0].tenant_id)
        .limit(1);

      const tenant = tenantData?.[0];
      if (tenant) {
        return {
          status: "RESOLVED",
          role: "ATHLETE",
          tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
          redirectPath: `/${tenant.slug}/membership/status`,
        };
      }
    }

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
 * Lógica idêntica ao frontend (src/lib/slugify.ts) para consistência.
 * ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * Palavras reservadas que não podem ser usadas como slugs.
 */
const RESERVED_SLUGS = ['admin', 'auth', 'login', 'logout', 'help', 'portal', 'api', 'app', 'forgot-password', 'reset-password', 'join', 'verify'];

function generateSlug(name: string): string {
  if (!name) return '';

  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-")     // replace non-alphanumeric with hyphen
    .replace(/-+/g, "-")              // remove duplicate hyphens
    .replace(/^-+|-+$/g, "")          // trim hyphens from edges
    .substring(0, 48);
}

function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug.toLowerCase());
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * JOIN_EXISTING_TENANT — ENTRY INTO EXISTING ORGANIZATION (PI-ONB-001)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * CONTRATO SAFE GOLD:
 *   1. Valida tenantCode (slug) — formato e existência
 *   2. Valida tenant.status === 'ACTIVE'
 *   3. Verifica idempotência via mesma tabela (memberships)
 *   4. Cria membership com status = 'PENDING_REVIEW'
 *   5. Marca wizard_completed = true (SEM SETAR tenant_id no profile!)
 *   6. Registra audit log
 *   7. Retorna redirect para /{slug}/membership/status
 *
 * ═══════════════════════════════════════════════════════════════════════════════ */

async function handleJoinExistingTenant(
  supabase: SupabaseClient,
  userId: string,
  payload: JoinExistingTenantPayload
): Promise<IdentityResponse> {
  console.log("[resolve-identity-wizard] JOIN_EXISTING_TENANT started:", { userId });

  /* ─────────────────────────────────────────────────────────────────────────────
   * VALIDAÇÃO 1: tenantCode obrigatório e formato permitido
   * ───────────────────────────────────────────────────────────────────────────── */
  const raw = (payload?.tenantCode ?? "").trim().toLowerCase();

  if (!raw) {
    return {
      status: "ERROR",
      error: { code: "VALIDATION_ERROR", message: "Código da organização é obrigatório." },
    };
  }

  // slug-safe: letras, números e hífen, 3-64 caracteres
  if (!/^[a-z0-9-]{3,64}$/.test(raw)) {
    return {
      status: "ERROR",
      error: { code: "VALIDATION_ERROR", message: "Código inválido. Use apenas letras, números e hífen (3-64 caracteres)." },
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 2: Buscar tenant por slug (case-insensitive)
   * ───────────────────────────────────────────────────────────────────────────── */
  const { data: tenantRows, error: tenantErr } = await supabase
    .from("tenants")
    .select("id, slug, name, status")
    .ilike("slug", raw)
    .limit(1);

  if (tenantErr) {
    console.error("[JOIN_EXISTING_TENANT] Tenant lookup error:", tenantErr);
    return {
      status: "ERROR",
      error: { code: "UNKNOWN", message: "Erro ao validar organização." },
    };
  }

  const tenant = tenantRows?.[0];
  if (!tenant) {
    return {
      status: "ERROR",
      error: { code: "TENANT_NOT_FOUND", message: "Organização não encontrada." },
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 3: Validar status do tenant (apenas ACTIVE permite join)
   * ───────────────────────────────────────────────────────────────────────────── */
  if (String(tenant.status).toUpperCase() !== "ACTIVE") {
    return {
      status: "ERROR",
      error: { code: "TENANT_INACTIVE", message: "Esta organização não está ativa para novos membros." },
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 4: Checar duplicidade no MESMO objeto que será escrito (memberships)
   * Regra SAFE GOLD: Idempotência usando a mesma tabela
   * ───────────────────────────────────────────────────────────────────────────── */
  const { data: existingMemberships, error: memErr } = await supabase
    .from("memberships")
    .select("id, status")
    .eq("tenant_id", tenant.id)
    .eq("applicant_profile_id", userId)
    .limit(1);

  if (memErr) {
    console.error("[JOIN_EXISTING_TENANT] Membership lookup error:", memErr);
    return {
      status: "ERROR",
      error: { code: "UNKNOWN", message: "Erro ao validar vínculo existente." },
    };
  }

  const existing = existingMemberships?.[0];
  if (existing) {
    const st = String(existing.status).toUpperCase();

    if (st === "PENDING_REVIEW") {
      return {
        status: "ERROR",
        error: { code: "ALREADY_REQUESTED", message: "Sua solicitação já está em análise." },
      };
    }

    if (st === "ACTIVE" || st === "APPROVED") {
      return {
        status: "ERROR",
        error: { code: "ALREADY_MEMBER", message: "Você já faz parte desta organização." },
      };
    }

    // REVOKED/REJECTED/CANCELLED/EXPIRED: bloquear e pedir suporte
    return {
      status: "ERROR",
      error: { code: "ONBOARDING_FORBIDDEN", message: "Não foi possível solicitar entrada. Contate a administração." },
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 5: Inserir membership PENDING_REVIEW (sem role direto!)
   * ───────────────────────────────────────────────────────────────────────────── */
  const { error: insertErr } = await supabase
    .from("memberships")
    .insert({
      tenant_id: tenant.id,
      applicant_profile_id: userId,
      status: "PENDING_REVIEW",
      type: "FIRST_MEMBERSHIP",
      applicant_data: { created_via: "identity_wizard" },
    });

  if (insertErr) {
    console.error("[JOIN_EXISTING_TENANT] Membership insert error:", insertErr);
    
    // Idempotência por unique index: se duplicou por race condition
    const msg = (insertErr.message ?? "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return {
        status: "ERROR",
        error: { code: "ALREADY_REQUESTED", message: "Sua solicitação já está em análise." },
      };
    }

    return {
      status: "ERROR",
      error: { code: "UNKNOWN", message: "Erro ao criar solicitação." },
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 6: Marcar wizard como completo (NUNCA setar tenant_id aqui!)
   * Regra SAFE GOLD: profiles.tenant_id NÃO é setado no JOIN
   * ───────────────────────────────────────────────────────────────────────────── */
  const { error: profileErr } = await supabase
    .from("profiles")
    .update({ wizard_completed: true })
    .eq("id", userId);

  if (profileErr) {
    console.error("[JOIN_EXISTING_TENANT] Profile update error:", profileErr);
    // Continue anyway - não é bloqueante
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 7: Audit log
   * ───────────────────────────────────────────────────────────────────────────── */
  await supabase.from("audit_logs").insert({
    tenant_id: tenant.id,
    profile_id: userId,
    event_type: "ATHLETE_JOIN_REQUEST_VIA_WIZARD",
    metadata: { tenant_slug: tenant.slug },
  });

  console.log("[JOIN_EXISTING_TENANT] Success - membership PENDING_REVIEW created:", {
    userId,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
  });

  /* ─────────────────────────────────────────────────────────────────────────────
   * RETORNO: RESOLVED com redirect para status page
   * ───────────────────────────────────────────────────────────────────────────── */
  return {
    status: "RESOLVED",
    role: "ATHLETE",
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    redirectPath: `/${tenant.slug}/membership/status`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * ACCEPT_INVITE — STUB FOR FUTURE INVITE SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════════ */

async function handleAcceptInvite(
  _supabase: SupabaseClient,
  _userId: string,
  _payload: { inviteToken: string }
): Promise<IdentityResponse> {
  return {
    status: "ERROR",
    error: { code: "NOT_IMPLEMENTED", message: "Convites ainda não implementados." },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * LEGACY COMPLETE_WIZARD — COMPATIBILITY ROUTER
 * ═══════════════════════════════════════════════════════════════════════════════
 * Mantido para compatibilidade temporária.
 * Roteia para CREATE_TENANT ou JOIN_EXISTING_TENANT baseado no joinMode.
 * ═══════════════════════════════════════════════════════════════════════════════ */

async function handleLegacyCompleteWizard(
  supabase: SupabaseClient,
  userId: string,
  payload: LegacyCompleteWizardPayload
): Promise<IdentityResponse> {
  console.log("[resolve-identity-wizard] COMPLETE_WIZARD (legacy) - routing based on joinMode:", payload?.joinMode);

  if (payload?.joinMode === "new") {
    // Mapear para CREATE_TENANT
    return handleCreateTenant(supabase, userId, { orgName: payload.newOrgName || "" });
  }

  if (payload?.joinMode === "existing") {
    // Mapear para JOIN_EXISTING_TENANT
    return handleJoinExistingTenant(supabase, userId, { tenantCode: payload.inviteCode || "" });
  }

  return {
    status: "ERROR",
    error: { code: "VALIDATION_ERROR", message: "joinMode inválido. Use 'new' ou 'existing'." },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * CREATE_TENANT — TENANT CREATION (SETUP MODE)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * P2.HOTFIX — Cria tenant via Wizard em modo SETUP
 *
 * REGRAS:
 *   1. Tenant é criado com status = 'SETUP', creation_source = 'wizard'
 *   2. Usuário recebe APENAS role ADMIN_TENANT do tenant criado
 *   3. Nenhuma lógica de billing é executada
 *   4. Nenhum convite automático é enviado
 *   5. Usuário é redirecionado para /{slug}/app/onboarding
 *
 * SEGURANÇA:
 *   - Tenant em SETUP não aparece em listagens públicas (is_active = true, mas status = SETUP)
 *   - Billing não é criado até onboarding ser completado
 *   - Operações destrutivas são bloqueadas até tenant estar ACTIVE
 *
 * ═══════════════════════════════════════════════════════════════════════════════ */

async function handleCreateTenant(
  supabase: SupabaseClient,
  userId: string,
  payload: CreateTenantPayload
): Promise<IdentityResponse> {
  console.log("[resolve-identity-wizard] CREATE_TENANT started:", { userId });

  /* ─────────────────────────────────────────────────────────────────────────────
   * VALIDAÇÃO 1: Nome da organização
   * ───────────────────────────────────────────────────────────────────────────── */
  const orgName = payload?.orgName?.trim();
  if (!orgName || orgName.length < 3) {
    console.warn("[CREATE_TENANT] INVALID_PAYLOAD: orgName missing or too short");
    return {
      status: "ERROR",
      error: {
        code: "INVALID_PAYLOAD",
        message: "Organization name must be at least 3 characters.",
      },
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * VALIDAÇÃO 2: Idempotência
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
      console.log("[CREATE_TENANT] IDEMPOTENT: Wizard already completed, returning existing tenant");
      return {
        status: "RESOLVED",
        role: "ADMIN_TENANT",
        tenant: existingTenantData[0],
        redirectPath: `/${existingTenantData[0].slug}/app`,
      };
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * VALIDAÇÃO 3: Geração de slug único
   * Tenta até 20 variações para evitar colisão
   * ───────────────────────────────────────────────────────────────────────────── */
  const baseSlug = generateSlug(orgName);
  
  // ✅ Validação de slug reservado
  if (isReservedSlug(baseSlug)) {
    console.warn("[CREATE_TENANT] RESERVED_SLUG:", baseSlug);
    return {
      status: "ERROR",
      error: {
        code: "RESERVED_SLUG",
        message: "This organization name would create a reserved URL.",
      },
    };
  }

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
      console.error("[CREATE_TENANT] SLUG_CONFLICT: Could not generate unique slug after 20 attempts");
      return {
        status: "ERROR",
        error: { code: "SLUG_CONFLICT", message: "Could not generate unique slug." },
      };
    }

    finalSlug = `${baseSlug}-${attemptIndex + 1}`;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * ✅ CRIAR TENANT EM MODO SETUP (HARDENED)
   * ═══════════════════════════════════════════════════════════════════════════ */
  
  const sanitizedPayload = {
    name: orgName,
    slug: finalSlug,
    is_active: true,
    status: "SETUP" as const,
    creation_source: "wizard" as const,
    onboarding_completed: false,
    sport_types: [] as string[],
  };
  
  console.log("[CREATE_TENANT] Creating tenant in SETUP mode:", {
    name: sanitizedPayload.name,
    slug: sanitizedPayload.slug,
    status: sanitizedPayload.status,
    creation_source: sanitizedPayload.creation_source,
  });

  const { data: newTenant, error: tenantError } = await supabase
    .from("tenants")
    .insert(sanitizedPayload)
    .select("id, slug, name, status")
    .single();

  if (tenantError || !newTenant) {
    console.error("[CREATE_TENANT] Failed to create tenant:", {
      error: tenantError,
      code: tenantError?.code,
      message: tenantError?.message,
      details: tenantError?.details,
      hint: tenantError?.hint,
      user_id: userId,
    });
    
    if (tenantError?.code === "42501" || tenantError?.message?.includes("row-level security")) {
      console.error("[CREATE_TENANT] RLS policy violation detected - service_role key may be misconfigured");
    }
    
    return {
      status: "ERROR",
      error: {
        code: "TENANT_CREATION_FAILED",
        message: "Erro ao criar organização. Tente novamente.",
      },
    };
  }

  // ✅ SANITY CHECK PÓS-CRIAÇÃO
  if (newTenant.status !== "SETUP") {
    console.error("[CREATE_TENANT][SANITY_CHECK]", {
      expected: "SETUP",
      actual: newTenant.status,
      tenantId: newTenant.id,
      userId,
    });

    await emitBillingAuditEvent(supabase, {
      event_type: "WIZARD_ADMIN_ASSIGN_FAILED",
      tenant_id: newTenant.id,
      profile_id: userId,
      domain: "WIZARD",
      operation: "tenant_sanity_check",
      decision: "BLOCKED",
      tenant_status: newTenant.status,
      billing_status: null,
      metadata: {
        expected_status: "SETUP",
        actual_status: newTenant.status,
      },
    });

    // Rollback
    await supabase.from("tenants").delete().eq("id", newTenant.id);
    return {
      status: "ERROR",
      error: {
        code: "TENANT_CREATION_FAILED",
        message: "Erro ao criar organização. Tente novamente.",
      },
    };
  }

  console.log("[CREATE_TENANT] Tenant created successfully:", {
    id: newTenant.id,
    slug: newTenant.slug,
    status: newTenant.status,
  });

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 5: Atribuir role ADMIN_TENANT ao usuário criador
   * ───────────────────────────────────────────────────────────────────────────── */
  const { error: roleError } = await supabase.from("user_roles").insert({
    user_id: userId,
    role: "ADMIN_TENANT",
    tenant_id: newTenant.id,
  });

  if (roleError) {
    console.error("[CREATE_TENANT][ROLE_ASSIGN]", {
      tenantId: newTenant.id,
      userId,
      error: roleError.message,
      code: roleError.code,
      details: roleError.details,
    });

    await emitBillingAuditEvent(supabase, {
      event_type: "WIZARD_ADMIN_ASSIGN_FAILED",
      tenant_id: newTenant.id,
      profile_id: userId,
      domain: "WIZARD",
      operation: "assign_admin_role",
      decision: "BLOCKED",
      tenant_status: "SETUP",
      billing_status: null,
      metadata: {
        error_code: roleError.code,
        error_message: roleError.message,
      },
    });

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

  console.log("[CREATE_TENANT] ADMIN_TENANT role assigned to user:", userId);

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
    console.error("[CREATE_TENANT] Failed to update profile:", profileError);
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

  console.log("[CREATE_TENANT] Success - redirecting to onboarding");

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
