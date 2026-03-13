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
 *    *    3. JOIN_EXISTING_TENANT: Valida slug + redireciona para formulário de filiação
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
 *      4. Cria tenant com status=ACTIVE, creation_source=wizard (SAFE_BOOT)
 *      5. Cria tenant_billing com status=ACTIVE (idempotente)
 *      6. Atribui role ADMIN_TENANT ao usuário criador
 *      7. Marca wizard_completed = true
 *      8. Retorna RESOLVED + /{slug}/app
 *
 *    JOIN_EXISTING_TENANT:
 *      1. Valida tenantCode (slug)
 *      2. Busca tenant por slug (case-insensitive)
 *      3. Valida tenant status = ACTIVE
 *      4. Verifica se já existe membership ativa (re-entry rule)
 *      5. Marca wizard_completed = true (sem setar tenant_id no profile!)
 *      6. Retorna RESOLVED + /{slug}/membership/adult (redirect para form)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { emitBillingAuditEvent } from "../_shared/emitBillingAuditEvent.ts";
import { createBackendLogger, type BackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { okResponse, errorResponse, buildErrorEnvelope, ERROR_CODES } from "../_shared/errors/envelope.ts";
import { buildCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

/* ═══════════════════════════════════════════════════════════════════════════════
 * CORS HEADERS
 * ═══════════════════════════════════════════════════════════════════════════════ */


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
type Action =
  | "CHECK"
  | "CREATE_TENANT"
  | "JOIN_EXISTING_TENANT"
  | "ACCEPT_INVITE"
  | "COMPLETE_WIZARD"
  | "POST_AUTH_REDIRECT";

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

interface PostAuthRedirectPayload {
  tenantSlug?: string | null;
  nextPath?: string | null;
}

type RequestPayload =
  | { action: "CHECK" }
  | { action: "CREATE_TENANT"; payload: CreateTenantPayload }
  | { action: "JOIN_EXISTING_TENANT"; payload: JoinExistingTenantPayload }
  | { action: "ACCEPT_INVITE"; payload: { inviteToken: string } }
  | { action: "COMPLETE_WIZARD"; payload: LegacyCompleteWizardPayload }
  | { action: "POST_AUTH_REDIRECT"; payload: PostAuthRedirectPayload };

/**
 * Estados de identidade retornados.
 * - RESOLVED: Identidade completa, pode redirecionar
 * - WIZARD_REQUIRED: Precisa completar wizard
 * - ERROR: Falha com código específico
 */
type IdentityStatus = "RESOLVED" | "WIZARD_REQUIRED" | "ERROR";

interface IdentityResponse {
  status: IdentityStatus;
  role?: "SUPERADMIN_GLOBAL" | "ADMIN_TENANT" | "ATLETA";
  tenant?: { id: string; slug: string; name: string };
  redirectPath?: string;
  error?: { code: string; message: string };
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * ENTRYPOINT — REQUEST ROUTER
 * ═══════════════════════════════════════════════════════════════════════════════ */

Deno.serve(async (req) => {
  // Runtime entry (structured logging only — no console.log with payloads)

  /* ───────────────────────────────────────────────────────────────────────────
   * CORS PREFLIGHT
   * ─────────────────────────────────────────────────────────────────────────── */
  // Build CORS headers dynamically from request origin
  const reqOrigin = req.headers.get("Origin");
  const corsHeaders = buildCorsHeaders(reqOrigin);

  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  /** Response helper — always HTTP 200, CORS-aware */
  const jsonResponse = (payload: IdentityResponse) =>
    new Response(JSON.stringify({ ok: true, data: payload }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("resolve-identity-wizard", correlationId);

  try {
    /* ─────────────────────────────────────────────────────────────────────────
     * VALIDAÇÃO DE AUTENTICAÇÃO
     * ───────────────────────────────────────────────────────────────────────── */
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({
        status: "ERROR",
        error: { code: "UNAUTHORIZED", message: "Missing token" },
      });
    }

    /* ─────────────────────────────────────────────────────────────────────────
     * INICIALIZAÇÃO DE CLIENTES SUPABASE
     * ───────────────────────────────────────────────────────────────────────── */
    // PI-SAFE-GOLD-GATE-TRACE-001 — FAIL-FAST ENV VALIDATION (P0)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return jsonResponse({
        status: "ERROR",
        error: { code: "SERVER_CONFIG_ERROR", message: "Server configuration error" },
      });
    }

    // Client com JWT do usuário (apenas para validação de auth)
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service client (para resolução de identidade)
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    /* ─────────────────────────────────────────────────────────────────────────
     * VALIDAÇÃO DE USUÁRIO
     * ───────────────────────────────────────────────────────────────────────── */
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();

    if (userError || !user?.id) {
      return jsonResponse({
        status: "ERROR",
        error: { code: "INVALID_TOKEN", message: "Invalid session" },
      });
    }

    log.setUser(user.id);

    /* ─────────────────────────────────────────────────────────────────────────
     * ROTEAMENTO DE AÇÃO
     * ───────────────────────────────────────────────────────────────────────── */
    const body = (await req.json()) as RequestPayload;

    switch (body.action) {
      case "CHECK":
        return jsonResponse(await handleIdentityCheck(supabaseAdmin, user.id, log));

      case "CREATE_TENANT":
        return jsonResponse(await handleCreateTenant(supabaseAdmin, user.id, body.payload, log));

      case "JOIN_EXISTING_TENANT":
        return jsonResponse(await handleJoinExistingTenant(supabaseAdmin, user.id, body.payload, log));

      case "ACCEPT_INVITE":
        return jsonResponse(await handleAcceptInvite(supabaseAdmin, user.id, body.payload, log));

      case "COMPLETE_WIZARD":
        // Compatibilidade temporária — roteia para action correta
        return jsonResponse(await handleLegacyCompleteWizard(supabaseAdmin, user.id, body.payload, log));

      case "POST_AUTH_REDIRECT":
        return jsonResponse(await handlePostAuthRedirect(supabaseAdmin, user.id, body.payload, log));

      default:
        return jsonResponse({
          status: "ERROR",
          error: { code: "INVALID_ACTION", message: "Invalid action" },
        });
    }
  } catch (err) {
    log.error("Unhandled error", err);
    return jsonResponse({
      status: "ERROR",
      error: { code: "INTERNAL", message: "Unexpected error" },
    });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════════
 * ROLE PRIORITY — DETERMINISTIC RESOLUTION (PURE)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Explicit priority map for multi-role users.
 * Lower number = higher priority.
 * Unknown roles default to lowest priority.
 * Tie-break: created_at DESC, then id DESC.
 * ═══════════════════════════════════════════════════════════════════════════════ */

const ROLE_PRIORITY: Record<string, number> = {
  ADMIN_TENANT: 1,
  STAFF_ORGANIZACAO: 2,
  INSTRUTOR: 3,
  COACH_PRINCIPAL: 4,
  COACH_ASSISTENTE: 5,
  RECEPCAO: 6,
  ATLETA: 7,
};
const DEFAULT_ROLE_PRIORITY = 99;

interface RoleCandidate {
  id: string;
  tenant_id: string;
  role: string;
  created_at: string | null;
}

/**
 * Pure function — picks the highest-priority role from candidates.
 * Strategy: ROLE_PRIORITY_V1
 *   1. Lowest priority number wins
 *   2. Tie-break by created_at DESC (newest first)
 *   3. Final tie-break by id DESC (deterministic)
 */
function pickBestRole(candidates: RoleCandidate[]): RoleCandidate {
  return candidates.sort((a, b) => {
    const pa = ROLE_PRIORITY[a.role] ?? DEFAULT_ROLE_PRIORITY;
    const pb = ROLE_PRIORITY[b.role] ?? DEFAULT_ROLE_PRIORITY;
    if (pa !== pb) return pa - pb;

    // Tie-break: created_at DESC
    if (a.created_at && b.created_at) {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (diff !== 0) return diff;
    }

    // Final tie-break: id DESC (lexicographic, deterministic)
    return b.id.localeCompare(a.id);
  })[0];
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
 *      (multi-role: pickBestRole with ROLE_PRIORITY_V1)
 *   4. Fallback → ERROR
 * ═══════════════════════════════════════════════════════════════════════════════ */

async function handleIdentityCheck(
  supabase: SupabaseClient,
  userId: string,
  log: BackendLogger,
): Promise<IdentityResponse> {
  log.setStep("identity-check");

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
  const { data: profileData } = await supabase.from("profiles").select("wizard_completed").eq("id", userId).limit(1);

  const wizardCompleted = profileData?.[0]?.wizard_completed === true;

  if (!wizardCompleted) {
    return { status: "WIZARD_REQUIRED" };
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 3: RESOLVER ROLE + TENANT (DETERMINISTIC — ROLE_PRIORITY_V1)
   * 🔒 Fetches ALL candidate roles, then picks best via pure function.
   * 🔒 NÃO usar maybeSingle() — padrão de segurança
   * ───────────────────────────────────────────────────────────────────────────── */
  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("id, tenant_id, role, created_at")
    .eq("user_id", userId)
    .not("tenant_id", "is", null);

  const roleCandidates = (userRoles ?? []) as RoleCandidate[];

  log.info("Role candidates fetched", {
    role_candidates_count: roleCandidates.length,
    strategy: "ROLE_PRIORITY_V1",
  });

  if (roleCandidates.length === 0) {
    // Usuário com wizard_completed mas sem role: checar se tem membership PENDING
    const { data: pendingMemberships } = await supabase
      .from("memberships")
      .select("id, tenant_id, status")
      .eq("applicant_profile_id", userId)
      .in("status", ["DRAFT", "PENDING_PAYMENT", "PENDING_REVIEW"])
      .order("created_at", { ascending: false })
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
        log.info("Resolved via pending membership", {
          membership_id: pendingMemberships[0].id,
          membership_status: pendingMemberships[0].status,
          selected_tenant_id: tenant.id,
        });
        return {
          status: "RESOLVED",
          role: "ATLETA",
          tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
          redirectPath: `/${tenant.slug}/membership/status`,
        };
      }
    }

    // PI-ONB-ENDTOEND-HARDEN-001: Orphan detection
    // wizard_completed=true but no role and no pending membership = orphan user
    // Force back to wizard instead of error
    log.warn("Orphan user detected: wizard_completed but no role/membership", { userId });
    return {
      status: "WIZARD_REQUIRED",
      error: {
        code: "ONBOARDING_INCOMPLETE",
        message: "Onboarding incomplete — please complete wizard again",
      },
    };
  }

  // Deterministic selection from candidates
  const roleRecord = pickBestRole(roleCandidates);

  log.info("Role selected", {
    selected_role: roleRecord.role,
    selected_tenant_id: roleRecord.tenant_id,
    role_candidates_count: roleCandidates.length,
    strategy: "ROLE_PRIORITY_V1",
  });

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
    role: isAdmin ? "ADMIN_TENANT" : "ATLETA",
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
    },
    redirectPath: isAdmin ? `/${tenant.slug}/app` : `/${tenant.slug}/portal`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * POST_AUTH_REDIRECT — RESOLVE REDIRECT PATH AFTER AUTHENTICATION
 * ═══════════════════════════════════════════════════════════════════════════════
 * Centraliza a decisão de redirect pós-login para athletes/membros.
 * Se tenantSlug não informado ou inválido → fallback para handleIdentityCheck.
 * SEMPRE retorna HTTP 200.
 * ═══════════════════════════════════════════════════════════════════════════════ */

async function handlePostAuthRedirect(
  supabase: SupabaseClient,
  userId: string,
  payload: PostAuthRedirectPayload,
  log: BackendLogger,
): Promise<IdentityResponse> {
  log.setStep("post-auth-redirect");

  const tenantSlug = (payload?.tenantSlug ?? "").trim().toLowerCase();

  // Se não houver slug → fallback para fluxo padrão
  if (!tenantSlug) {
    return handleIdentityCheck(supabase, userId, log);
  }

  // Buscar tenant por slug (match EXATO)
  const { data: tenantRows } = await supabase
    .from("tenants")
    .select("id, slug, name, status")
    .eq("slug", tenantSlug)
    .limit(1);

  const tenant = tenantRows?.[0];

  if (!tenant) {
    return handleIdentityCheck(supabase, userId, log);
  }

  // Buscar athlete vinculado ao tenant
  const { data: athletes } = await supabase
    .from("athletes")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("profile_id", userId)
    .limit(1);

  const athleteId = athletes?.[0]?.id;
  let membershipStatus: string | null = null;

  if (athleteId) {
    const { data: memberships } = await supabase
      .from("memberships")
      .select("status")
      .eq("tenant_id", tenant.id)
      .eq("athlete_id", athleteId)
      .order("created_at", { ascending: false })
      .limit(1);

    membershipStatus = memberships?.[0]?.status?.toUpperCase() ?? null;
  } else {
    const { data: memberships } = await supabase
      .from("memberships")
      .select("status")
      .eq("tenant_id", tenant.id)
      .eq("applicant_profile_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    membershipStatus = memberships?.[0]?.status?.toUpperCase() ?? null;
  }

  let redirectPath: string;

  switch (membershipStatus) {
    case "APPROVED":
    case "ACTIVE":
      redirectPath = `/${tenant.slug}/portal`;
      break;

    case "PENDING_REVIEW":
    case "PENDING_PAYMENT":
    case "DRAFT":
      redirectPath = `/${tenant.slug}/membership/status`;
      break;

    default:
      redirectPath = `/${tenant.slug}/portal`;
  }

  // Sanitização defensiva do nextPath
  const nextPathRaw = payload?.nextPath ?? null;

  if (typeof nextPathRaw === "string") {
    const nextPath = nextPathRaw.trim();

    const isValid = nextPath.startsWith(`/${tenant.slug}/`) && !nextPath.includes("..") && !nextPath.startsWith("//");

    if (isValid) {
      redirectPath = nextPath;
    }
  }

  log.info("POST_AUTH_REDIRECT resolved", {
    tenantSlug: tenant.slug,
    membershipStatus,
    redirectPath,
  });

  return {
    status: "RESOLVED",
    role: "ATLETA",
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
    },
    redirectPath,
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
const RESERVED_SLUGS = [
  "about",
  "admin",
  "api",
  "app",
  "auth",
  "forgot-password",
  "help",
  "identity",
  "join",
  "login",
  "logout",
  "portal",
  "reset-password",
  "signup",
  "verify",
];

function generateSlug(name: string): string {
  if (!name) return "";

  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumeric with hyphen
    .replace(/-+/g, "-") // remove duplicate hyphens
    .replace(/^-+|-+$/g, "") // trim hyphens from edges
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
 *   3. Verifica re-entry rule (bloqueia se membership ativa existe)
 *   4. Marca wizard_completed = true (SEM SETAR tenant_id no profile!)
 *   5. Registra audit log
 *   6. Retorna redirect para /{slug}/membership/adult (form cria membership)
 *
 * ═══════════════════════════════════════════════════════════════════════════════ */

async function handleJoinExistingTenant(
  supabase: SupabaseClient,
  userId: string,
  payload: JoinExistingTenantPayload,
  log: BackendLogger,
): Promise<IdentityResponse> {
  log.setStep("join-existing-tenant");
  log.info("JOIN_EXISTING_TENANT started", { userId });

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
      error: {
        code: "VALIDATION_ERROR",
        message: "Código inválido. Use apenas letras, números e hífen (3-64 caracteres).",
      },
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
    log.error("Tenant lookup error", tenantErr);
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
   * STEP 4: Re-entry rule — block only if an ACTIVE pipeline membership exists
   *
   * Blocking statuses: DRAFT, PENDING_PAYMENT, PENDING_REVIEW, APPROVED
   * Non-blocking (re-entry allowed): CANCELLED, REJECTED, EXPIRED, etc.
   *
   * A user may have unlimited historical memberships.
   * ───────────────────────────────────────────────────────────────────────────── */
  const BLOCKING_STATUSES = ["DRAFT", "PENDING_PAYMENT", "PENDING_REVIEW", "APPROVED"];

  const { data: activeMembership, error: memErr } = await supabase
    .from("memberships")
    .select("id, status")
    .eq("applicant_profile_id", userId)
    .eq("tenant_id", tenant.id)
    .in("status", BLOCKING_STATUSES)
    .limit(1);

  if (memErr) {
    log.error("Membership lookup error", memErr);
    return {
      status: "ERROR",
      error: { code: "UNKNOWN", message: "Erro ao validar vínculo existente." },
    };
  }

  if (activeMembership && activeMembership.length > 0) {
    const existing = activeMembership[0];
    const st = String(existing.status).toUpperCase();
    log.info("Membership re-entry blocked", { existing_id: existing.id, status: st });

    return {
      status: "ERROR",
      error: { code: "MEMBERSHIP_EXISTS", message: "Já existe um vínculo com esta organização." },
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 5: Marcar wizard como completo (NUNCA setar tenant_id aqui!)
   * Membership + athlete creation delegated to AdultMembershipForm / YouthMembershipForm
   * ───────────────────────────────────────────────────────────────────────────── */
  const { error: profileErr } = await supabase.from("profiles").update({ wizard_completed: true }).eq("id", userId);

  if (profileErr) {
    log.error("Profile update error", profileErr);
    // Continue anyway - não é bloqueante
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 6: Audit log
   * ───────────────────────────────────────────────────────────────────────────── */
  await supabase.from("audit_logs").insert({
    tenant_id: tenant.id,
    profile_id: userId,
    event_type: "WIZARD_JOIN_COMPLETED",
    metadata: { tenant_slug: tenant.slug },
  });

  log.info("Success - wizard completed, redirecting to membership form", {
    userId,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
  });

  /* ─────────────────────────────────────────────────────────────────────────────
   * RETORNO: RESOLVED com redirect para membership form
   * Membership creation happens in AdultMembershipForm / YouthMembershipForm
   * ───────────────────────────────────────────────────────────────────────────── */
  return {
    status: "RESOLVED",
    role: "ATLETA",
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    redirectPath: `/${tenant.slug}/membership/new`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * ACCEPT_INVITE — STUB FOR FUTURE INVITE SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════════ */

async function handleAcceptInvite(
  _supabase: SupabaseClient,
  _userId: string,
  _payload: { inviteToken: string },
  _log: BackendLogger,
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
  payload: LegacyCompleteWizardPayload,
  log: BackendLogger,
): Promise<IdentityResponse> {
  log.setStep("legacy-complete-wizard");
  log.info("COMPLETE_WIZARD (legacy) - routing based on joinMode", { joinMode: payload?.joinMode });

  if (payload?.joinMode === "new") {
    // Mapear para CREATE_TENANT
    return handleCreateTenant(supabase, userId, { orgName: payload.newOrgName || "" }, log);
  }

  if (payload?.joinMode === "existing") {
    // Mapear para JOIN_EXISTING_TENANT
    return handleJoinExistingTenant(supabase, userId, { tenantCode: payload.inviteCode || "" }, log);
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
  payload: CreateTenantPayload,
  log: BackendLogger,
): Promise<IdentityResponse> {
  log.setStep("create-tenant");
  log.info("CREATE_TENANT started", { userId });

  /* ─────────────────────────────────────────────────────────────────────────────
   * VALIDAÇÃO 1: Nome da organização
   * ───────────────────────────────────────────────────────────────────────────── */
  const orgName = payload?.orgName?.trim();
  if (!orgName || orgName.length < 3) {
    log.warn("INVALID_PAYLOAD: orgName missing or too short");
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
      .select("id, slug, name, status")
      .eq("id", existingProfile[0].tenant_id)
      .limit(1);

    if (existingTenantData?.[0]) {
      const existingTenant = existingTenantData[0];
      log.info("IDEMPOTENT: Wizard already completed, returning existing tenant", {
        tenantStatus: existingTenant.status,
      });
      return {
        status: "RESOLVED",
        role: "ADMIN_TENANT",
        tenant: { id: existingTenant.id, slug: existingTenant.slug, name: existingTenant.name },
        redirectPath: `/${existingTenant.slug}/app`,
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
    log.warn("RESERVED_SLUG detected", { slug: baseSlug });
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
    const { data: existingSlug } = await supabase.from("tenants").select("id").eq("slug", finalSlug).limit(1);

    if (!existingSlug || existingSlug.length === 0) {
      break; // Slug é único, pode prosseguir
    }

    if (attemptIndex === 20) {
      log.error("SLUG_CONFLICT: Could not generate unique slug after 20 attempts");
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

  // Wizard tenants start in SETUP status (allows empty sport_types via trigger).
  // After onboarding completes, status transitions to ACTIVE.
  // is_active=true for immediate route access.
  const sanitizedPayload = {
    name: orgName,
    slug: finalSlug,
    is_active: true,
    status: "SETUP" as const,
    lifecycle_status: "SETUP" as const,
    creation_source: "wizard" as const,
    onboarding_completed: false,
    sport_types: [] as string[],
  };

  log.info("Creating tenant in SETUP mode", {
    name: sanitizedPayload.name,
    slug: sanitizedPayload.slug,
    status: sanitizedPayload.status,
    creation_source: sanitizedPayload.creation_source,
  });

  const { data: newTenant, error: tenantError } = await supabase
    .from("tenants")
    .insert(sanitizedPayload)
    .select("id, slug, name, status")
    .maybeSingle();

  if (tenantError || !newTenant) {
    log.error("Failed to create tenant", tenantError, {
      code: tenantError?.code,
      details: tenantError?.details,
      hint: tenantError?.hint,
      message: tenantError?.message,
      user_id: userId,
    });

    if (tenantError?.code === "42501" || tenantError?.message?.includes("row-level security")) {
      log.error("RLS policy violation detected - service_role key may be misconfigured");
    }

    return {
      status: "ERROR",
      error: {
        code: "TENANT_CREATION_FAILED",
        message: "Erro ao criar organização. Tente novamente.",
      },
    };
  }

  // Sanity check: tenant should be in SETUP after wizard creation
  if (newTenant.status !== "SETUP") {
    log.error("SANITY_CHECK failed: unexpected status after creation", undefined, {
      expected: "SETUP",
      actual: newTenant.status,
      tenantId: newTenant.id,
      userId,
    });
    // Continue anyway — the tenant was created, just log the anomaly
  }

  log.info("Tenant created successfully", {
    id: newTenant.id,
    slug: newTenant.slug,
    status: newTenant.status,
  });

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 4.5: Ensure profile exists before role assignment (FK safety)
   * ───────────────────────────────────────────────────────────────────────────── */
  const { data: profileForFK } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();

  if (!profileForFK) {
    log.info("Profile not found, creating before role assignment", { userId });

    // Fetch user email from auth for profile creation
    const {
      data: { user: authUser },
    } = await supabase.auth.admin.getUserById(userId);
    const userEmail = authUser?.email ?? "unknown";

    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId,
      email: userEmail,
      created_at: new Date().toISOString(),
    });

    if (profileError) {
      log.error("PROFILE_CREATION_FAILED", profileError, { userId });

      // Rollback tenant
      await supabase.from("tenants").delete().eq("id", newTenant.id);

      return {
        status: "ERROR",
        error: {
          code: "PROFILE_CREATION_FAILED",
          message: "Falha ao criar perfil do usuário.",
        },
      };
    }

    log.info("Profile created successfully", { userId });
  }

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 5: Atribuir role ADMIN_TENANT ao usuário criador
   * ───────────────────────────────────────────────────────────────────────────── */
  log.info("Inserting ADMIN_TENANT role", { userId, tenantId: newTenant.id });

  const { error: roleError } = await supabase.rpc("grant_admin_tenant_role", {
    p_user_id: userId,
    p_tenant_id: newTenant.id,
    p_bypass_membership_check: true,
  });

  if (roleError) {
    log.error("ROLE_ASSIGN failed", roleError, {
      tenantId: newTenant.id,
      userId,
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
      tenant_status: "ACTIVE",
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

  log.info("ADMIN_TENANT role assigned to user", { userId });

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
    log.error("Failed to update profile", profileError);
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
      status: "ACTIVE",
      billing_status: "TRIALING",
      trial_days: 15,
    },
  });

  /* ─────────────────────────────────────────────────────────────────────────────
   * STEP 7.5: TRIAL_15_DAYS — Criar tenant_billing com status TRIALING (idempotente)
   * ───────────────────────────────────────────────────────────────────────────── */
  const { data: existingBilling } = await supabase
    .from("tenant_billing")
    .select("id")
    .eq("tenant_id", newTenant.id)
    .limit(1);

  if (!existingBilling || existingBilling.length === 0) {
    // TRIAL_15_DAYS: Create billing with TRIALING status and 15-day trial window
    const now = new Date();
    const trialExpiresAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // +15 days

    const { error: billingError } = await supabase.from("tenant_billing").upsert(
      {
        tenant_id: newTenant.id,
        status: "TRIALING",
        plan_name: "Plano Federação Anual",
        plan_price_id: "price_1Spz03HH533PC5DdDUbCe7fS",
        trial_started_at: now.toISOString(),
        trial_expires_at: trialExpiresAt.toISOString(),
        current_period_start: now.toISOString(),
        current_period_end: trialExpiresAt.toISOString(),
      },
      { onConflict: "tenant_id", ignoreDuplicates: true },
    );

    if (billingError) {
      log.error("TRIAL_15_DAYS: Failed to create tenant_billing", billingError);
      // Non-blocking — tenant already created and functional
    } else {
      log.info("TRIAL_15_DAYS: tenant_billing created with TRIALING status", {
        tenantId: newTenant.id,
        trialExpiresAt: trialExpiresAt.toISOString(),
      });
    }
  } else {
    log.info("TRIAL_15_DAYS: tenant_billing already exists, skipping", { tenantId: newTenant.id });
  }

  log.info("Success - redirecting to onboarding");

  /* ─────────────────────────────────────────────────────────────────────────────
   * RETORNO: RESOLVED com redirecionamento para /app (SAFE_BOOT: tenant ACTIVE)
   * ───────────────────────────────────────────────────────────────────────────── */
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
