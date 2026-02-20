/**
 * 🔐 approve-membership — Hardened Membership Approval
 *
 * PI-AUTH-CLIENT-SPLIT-001: Two-client architecture
 * - supabaseAuth  → ANON KEY + Authorization header (JWT validation only)
 * - supabaseAdmin → SERVICE_ROLE (all DB/RPC/storage/function operations)
 *
 * SECURITY (C6 Hardening):
 * - Requires ADMIN_TENANT or SUPERADMIN_GLOBAL role
 * - If superadmin, requires valid impersonation session
 * - Rate limited: 10 per hour per user
 * - Full decision logging for all paths
 * - Anti-enumeration responses
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { buildErrorEnvelope, errorResponse, okResponse, ERROR_CODES } from "../_shared/errors/envelope.ts";
import { getEmailClient, isEmailConfigured, DEFAULT_EMAIL_FROM } from "../_shared/emailClient.ts";
import { getMembershipApprovedTemplate, type EmailLayoutData } from "../_shared/email-templates/index.ts";
import {
  resolveMembershipNotification,
  shouldSend,
  type MembershipStatus,
  type SupportedLocale,
} from "../_shared/notification-engine.ts";
import {
  requireImpersonationIfSuperadmin,
  extractImpersonationId,
} from "../_shared/requireImpersonationIfSuperadmin.ts";
import { SecureRateLimiter, buildRateLimitContext } from "../_shared/secure-rate-limiter.ts";
import { extractRequestContext } from "../_shared/security-logger.ts";
import {
  logDecision,
  logRateLimitBlock,
  logPermissionDenied,
  logImpersonationBlock,
  logCrossTenantBlock,
  logMembershipApproved,
  logBillingRestricted,
  DECISION_TYPES,
} from "../_shared/decision-logger.ts";
import { requireBillingStatus, billingRestrictedResponse } from "../_shared/requireBillingStatus.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-impersonation-id",
};

interface ApproveMembershipRequest {
  membershipId: string;
  academyId?: string | null;
  coachId?: string | null;
  reviewNotes?: string | null;
  roles?: string[];
  impersonationId?: string;
}

// Valid roles that can be assigned during approval
const VALID_APPROVAL_ROLES = [
  "ATLETA",
  "COACH_ASSISTENTE",
  "COACH_PRINCIPAL",
  "INSTRUTOR",
  "STAFF_ORGANIZACAO",
] as const;

type ApprovalRole = (typeof VALID_APPROVAL_ROLES)[number];

interface ApplicantData {
  full_name: string;
  birth_date: string;
  national_id: string;
  gender: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  // Youth membership support
  is_minor?: boolean;
  guardian?: {
    full_name: string;
    national_id: string;
    email: string;
    phone: string;
    relationship: "PARENT" | "GUARDIAN" | "OTHER";
  };
}

interface DocumentUploaded {
  type: string;
  storage_path: string;
  file_type: string;
}

interface EmailResult {
  shouldSend: boolean;
  sent: boolean;
  templateId: string | null;
  skippedReason: "already_sent" | "engine_noop" | "resend_not_configured" | null;
}

function resolveBaseUrl(req: Request): string {
  const envUrl = Deno.env.get("PUBLIC_APP_URL");
  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }
  const origin = req.headers.get("origin");
  if (origin) {
    return origin.replace(/\/$/, "");
  }
  return "https://tatame-pro.lovable.app";
}

/**
 * Rate limiter preset: 10 approvals per hour per user
 */
function approveMembershipRateLimiter() {
  return new SecureRateLimiter({
    operation: "approve-membership",
    limit: 10,
    windowSeconds: 3600,
  });
}

/**
 * PI-SAFE-GOLD-GATE-TRACE-001: Typed deny gates for deterministic 403 tracing.
 * In PROD (GATE_TRACE unset): identical to previous forbiddenResp — no gate info exposed.
 * In DEV  (GATE_TRACE=1):     details: [gate] + x-deny-gate header for blind-403 debugging.
 */
type DenyGate =
  | "AUTH"
  | "RATE_LIMIT"
  | "PAYLOAD"
  | "MEMBERSHIP_FETCH"
  | "ROLE"
  | "IMPERSONATION"
  | "BILLING"
  | "STATUS"
  | "PAYMENT"
  | "APPLICANT_DATA"
  | "TENANT_FETCH";

function deny(gate: DenyGate, correlationId?: string): Response {
  const tracing = Deno.env.get("GATE_TRACE") === "1";
  const envelope = buildErrorEnvelope(
    ERROR_CODES.FORBIDDEN,
    "auth.operation_not_permitted",
    false,
    tracing ? [gate] : undefined,
    correlationId,
  );
  const headers: Record<string, string> = { ...corsHeaders };
  if (tracing) {
    headers["x-deny-gate"] = gate;
  }
  return errorResponse(403, envelope, headers);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("approve-membership", correlationId);

  // Variables for response
  let approved = false;
  let membershipId = "";
  let previousStatus: MembershipStatus = "PENDING_REVIEW";
  let newStatus: MembershipStatus = "APPROVED";
  let emailResult: EmailResult = {
    shouldSend: false,
    sent: false,
    templateId: null,
    skippedReason: null,
  };

  try {
    // ========================================================================
    // PI-SAFE-GOLD-GATE-TRACE-001 — FAIL-FAST ENV VALIDATION (P0)
    // No client instantiation before this block passes.
    // ========================================================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const hasUrl = typeof supabaseUrl === "string" && supabaseUrl.trim().length > 0;
    const hasServiceKey = typeof supabaseServiceKey === "string" && supabaseServiceKey.trim().length > 0;
    const hasAnonKey = typeof supabaseAnonKey === "string" && supabaseAnonKey.trim().length > 0;

    if (!hasUrl || !hasServiceKey || !hasAnonKey) {
      log.error("Fail-fast: missing required env vars", undefined, {
        hasUrl,
        hasServiceKey,
        hasAnonKey,
      });
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.misconfigured", false, undefined, correlationId),
        corsHeaders,
      );
    }

    // PI-SAFE-GOLD-ADMIN-KEY-PROBE-001 (A): Detect key mismatch
    if (supabaseServiceKey!.trim() === supabaseAnonKey!.trim()) {
      log.error("Fail-fast: SERVICE_ROLE key equals ANON key (misconfigured)");
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.misconfigured", false, undefined, correlationId),
        corsHeaders,
      );
    }

    // ========================================================================
    // PI-AUTH-CLIENT-SPLIT-001: Two-client architecture
    // ========================================================================
    const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceKey!);

    // PI-SAFE-GOLD-ADMIN-KEY-PROBE-001 (B): Deterministic SERVICE_ROLE privilege probe
    const GATE_TRACE = Deno.env.get("GATE_TRACE");
    {
      const probe = await supabaseAdmin.from("tenants").select("id").limit(1);
      if (probe.error) {
        if (GATE_TRACE === "1") {
          log.error("Service-role probe failed", probe.error, { message: probe.error.message });
        } else {
          log.error("Service-role probe failed");
        }
        return errorResponse(
          500,
          buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.misconfigured", false, undefined, correlationId),
          corsHeaders,
        );
      }
    }

    const supabaseAuth = createClient(supabaseUrl!, supabaseAnonKey!, {
      global: {
        headers: {
          Authorization: req.headers.get("authorization") ?? "",
        },
      },
    });

    // ========================================================================
    // 1️⃣ AUTH VALIDATION
    // ========================================================================
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      log.warn("Auth failed - missing header");
      await logPermissionDenied(supabaseAdmin, {
        operation: "approve-membership",
        reason: "MISSING_AUTH",
      });
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.missing_token", false, undefined, correlationId),
        corsHeaders,
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      log.warn("Auth failed - invalid token");
      await logPermissionDenied(supabaseAdmin, {
        operation: "approve-membership",
        reason: "INVALID_TOKEN",
      });
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.invalid_token", false, undefined, correlationId),
        corsHeaders,
      );
    }

    const adminProfileId = user.id;
    log.setUser(adminProfileId);
    log.info("Admin authenticated");

    // ========================================================================
    // 2️⃣ RATE LIMITING (before any business logic)
    // ========================================================================
    const rateLimiter = approveMembershipRateLimiter();
    const rateLimitCtx = buildRateLimitContext(req, user.id, null);
    // deno-lint-ignore no-explicit-any
    const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabaseAdmin as any);
    if (!rateLimitResult.allowed) {
      log.warn("Rate limit exceeded", { count: rateLimitResult.count });

      await logRateLimitBlock(supabaseAdmin, {
        operation: "approve-membership",
        user_id: user.id,
        ip_address: extractRequestContext(req).ip_address,
        count: rateLimitResult.count,
        limit: 10,
      });

      return rateLimiter.tooManyRequestsResponse(rateLimitResult, corsHeaders);
    }

    // ========================================================================
    // 3️⃣ PARSE INPUT
    // ========================================================================
    let body: ApproveMembershipRequest;
    try {
      body = await req.json();
    } catch {
      log.warn("Validation failed - invalid JSON");
      await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: "approve-membership",
        user_id: user.id,
        reason_code: "INVALID_PAYLOAD",
      });
      return deny("PAYLOAD", correlationId);
    }

    membershipId = body.membershipId;
    const { academyId, coachId, reviewNotes, roles: requestedRoles } = body;

    if (!membershipId) {
      log.warn("Validation failed - missing membershipId");
      await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: "approve-membership",
        user_id: user.id,
        reason_code: "MISSING_MEMBERSHIP_ID",
      });
      return deny("PAYLOAD", correlationId);
    }

    // ========================================================================
    // 4️⃣ FETCH MEMBERSHIP (Deterministic & Strict)
    // ========================================================================

    // Defensive UUID validation (prevents silent mismatch)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(membershipId)) {
      log.warn("Invalid membershipId format", { membershipId });

      await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: "approve-membership",
        user_id: user.id,
        reason_code: "INVALID_MEMBERSHIP_ID_FORMAT",
      });

      return deny("PAYLOAD", correlationId);
    }

    // STRICT fetch (must exist and be unique)
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("memberships")
      .select(
        `
    id,
    status,
    payment_status,
    tenant_id,
    applicant_profile_id,
    applicant_data,
    documents_uploaded,
    price_cents,
    currency,
    end_date,
    rejection_reason,
    email_sent_for_status,
    athlete_id
  `,
      )
      .eq("id", membershipId.trim())
      .single();

    if (membershipError) {
      if (Deno.env.get("GATE_TRACE") === "1") {
        log.warn("Membership fetch error (strict)", {
          membershipId,
          message: membershipError.message,
          code: (membershipError as any).code,
          details: (membershipError as any).details,
        });
      } else {
        log.warn("Membership fetch failed", { membershipId });
      }

      await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: "approve-membership",
        user_id: user.id,
        reason_code: "MEMBERSHIP_NOT_FOUND",
      });

      // Anti-enumeration
      return deny("MEMBERSHIP_FETCH", correlationId);
    }

    if (!membership) {
      log.warn("Membership null after strict fetch", { membershipId });

      await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: "approve-membership",
        user_id: user.id,
        reason_code: "MEMBERSHIP_NULL",
      });

      return deny("MEMBERSHIP_FETCH", correlationId);
    }
    // ========================================================================
    // 5️⃣ AUTHORIZATION CHECK (Role + Impersonation)
    // ========================================================================

    // 🔐 Defensive normalization (membership already fetched above)
    const targetTenantIdNormalized = String(targetTenantId);

    // 5.1 Fetch roles for current user
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", adminProfileId);

    // Normalize roles
    const normalizedRoles = (roles ?? []).map((r) => ({
      role: r.role,
      tenant_id: r.tenant_id === null ? null : String(r.tenant_id),
    }));

    const isSuperadmin = normalizedRoles.some((r) => r.role === "SUPERADMIN_GLOBAL" && r.tenant_id === null);

    const isTenantAdmin = normalizedRoles.some(
      (r) => (r.role === "ADMIN_TENANT" || r.role === "STAFF_ORGANIZACAO") && r.tenant_id === targetTenantIdNormalized,
    );

    // Snapshot log (critical for debugging determinism)
    log.info("Authorization snapshot", {
      targetTenantId: targetTenantIdNormalized,
      roles: normalizedRoles,
      isSuperadmin,
      isTenantAdmin,
    });

    // Block if no valid role
    if (!isSuperadmin && !isTenantAdmin) {
      log.warn("Permission denied - no valid role match");

      await logPermissionDenied(supabaseAdmin, {
        operation: "approve-membership",
        user_id: user.id,
        tenant_id: targetTenantIdNormalized,
        required_roles: ["ADMIN_TENANT", "STAFF_ORGANIZACAO", "SUPERADMIN_GLOBAL"],
        actual_roles: normalizedRoles.map((r) => r.role),
        reason: "INSUFFICIENT_PERMISSIONS",
      });

      return deny("ROLE", correlationId);
    }

    // 5.2 If superadmin → REQUIRE impersonation
    if (isSuperadmin) {
      const impersonationId = extractImpersonationId(req, body);

      // deno-lint-ignore no-explicit-any
      const impersonationCheck = await requireImpersonationIfSuperadmin(
        supabaseAdmin as any,
        user.id,
        targetTenantIdNormalized,
        impersonationId,
      );

      if (!impersonationCheck.valid) {
        log.warn("Impersonation validation failed", {
          error: impersonationCheck.error,
        });

        await logImpersonationBlock(supabaseAdmin, {
          operation: "approve-membership",
          user_id: user.id,
          tenant_id: targetTenantIdNormalized,
          impersonation_id: impersonationId || undefined,
          reason: impersonationCheck.error || "INVALID_IMPERSONATION",
        });

        return deny("IMPERSONATION", correlationId);
      }

      log.info("Superadmin with valid impersonation", {
        impersonationId: impersonationCheck.impersonationId,
      });
    }

    log.info("Authorization verified", {
      isSuperadmin,
      isTenantAdmin,
    });

    // ========================================================================
    // 5️⃣.5️⃣ BILLING STATUS CHECK (P1 - Block operations on restricted tenants)
    // ========================================================================
    const billingCheck = await requireBillingStatus(supabaseAdmin, targetTenantId);
    if (!billingCheck.allowed) {
      log.warn("Billing status blocked operation", {
        status: billingCheck.status,
        code: billingCheck.code,
      });

      await logBillingRestricted(supabaseAdmin, {
        operation: "approve-membership",
        user_id: user.id,
        tenant_id: targetTenantId,
        billing_status: billingCheck.status,
      });

      const billingResp = billingRestrictedResponse(billingCheck.status);
      if (Deno.env.get("GATE_TRACE") === "1") {
        billingResp.headers.set("x-deny-gate", "BILLING");
      }
      return billingResp;
    }

    log.info("Billing status OK", { status: billingCheck.status });

    // ========================================================================
    // 6️⃣ VALIDATE MEMBERSHIP STATUS & PAYMENT
    // ========================================================================
    if (previousStatus !== "PENDING_REVIEW") {
      log.warn("Invalid status for approval", { status: previousStatus });
      await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: "approve-membership",
        user_id: user.id,
        tenant_id: targetTenantId,
        reason_code: "INVALID_STATUS",
        metadata: { current_status: previousStatus },
      });
      return deny("STATUS", correlationId);
    }

    if (membership.payment_status !== "PAID" && membership.payment_status !== "WAIVED") {
      log.warn("Payment not completed", { payment_status: membership.payment_status });
      await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: "approve-membership",
        user_id: user.id,
        tenant_id: targetTenantId,
        reason_code: "PAYMENT_INCOMPLETE",
      });
      return deny("PAYMENT", correlationId);
    }

    const applicantData = membership.applicant_data as ApplicantData | null;
    if (!applicantData) {
      log.warn("Missing applicant data");
      await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: "approve-membership",
        user_id: user.id,
        tenant_id: targetTenantId,
        reason_code: "MISSING_APPLICANT_DATA",
      });
      return deny("APPLICANT_DATA", correlationId);
    }

    // ========================================================================
    // 7️⃣ VALIDATE ROLES
    // ========================================================================
    const validatedRoles: ApprovalRole[] = [];

    if (!requestedRoles || requestedRoles.length === 0) {
      validatedRoles.push("ATLETA");
      log.info("No roles provided, defaulting to ATLETA");
    } else {
      // SAFE GOLD: Explicit rejection of invalid roles (no silent ignore)
      for (const role of requestedRoles) {
        if (!VALID_APPROVAL_ROLES.includes(role as ApprovalRole)) {
          log.warn("Invalid role for membership approval", { role });
          await logDecision(supabaseAdmin, {
            decision_type: DECISION_TYPES.VALIDATION_FAILURE,
            severity: "MEDIUM",
            operation: "approve-membership",
            user_id: user.id,
            tenant_id: targetTenantId,
            reason_code: "INVALID_ROLE_FOR_APPROVAL",
            metadata: { rejected_role: role },
          });
          return errorResponse(
            400,
            buildErrorEnvelope(
              ERROR_CODES.VALIDATION_ERROR,
              `Invalid role for membership approval: ${role}`,
              false,
              undefined,
              correlationId,
            ),
            corsHeaders,
          );
        }
        validatedRoles.push(role as ApprovalRole);
      }

      if (validatedRoles.length === 0) {
        log.warn("No valid roles provided");
        await logDecision(supabaseAdmin, {
          decision_type: DECISION_TYPES.VALIDATION_FAILURE,
          severity: "LOW",
          operation: "approve-membership",
          user_id: user.id,
          tenant_id: targetTenantId,
          reason_code: "NO_VALID_ROLES",
        });
        return deny("PAYLOAD", correlationId);
      }
    }

    log.info("Roles validated", { roles: validatedRoles });

    // ========================================================================
    // 8️⃣ FETCH TENANT DATA
    // ========================================================================
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id, slug, name, default_locale")
      .eq("id", targetTenantId)
      .single();

    if (tenantError || !tenant) {
      log.warn("Tenant not found");
      await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "MEDIUM",
        operation: "approve-membership",
        user_id: user.id,
        tenant_id: targetTenantId,
        reason_code: "TENANT_NOT_FOUND",
      });
      return deny("TENANT_FETCH", correlationId);
    }

    log.info("Tenant data fetched", { slug: tenant.slug });

    // ========================================================================
    // C7: IDEMPOTENCY GUARD — Skip creation if athlete already exists
    // ========================================================================
    let resolvedAthleteId: string;
    let guardianId: string | null = null;

    if (membership.athlete_id) {
      // NEW FLOW: Athlete already created by form (C3/C4/C5)
      log.info("C7: Athlete already exists (created by form)", { athleteId: membership.athlete_id });

      const { data: existingAthlete, error: fetchErr } = await supabaseAdmin
        .from("athletes")
        .select("id")
        .eq("id", membership.athlete_id)
        .single();

      if (fetchErr || !existingAthlete) {
        log.error("C7: Referenced athlete not found", fetchErr);
        return errorResponse(
          500,
          buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
          corsHeaders,
        );
      }

      resolvedAthleteId = existingAthlete.id;
      log.info("C7: Using pre-existing athlete", { resolvedAthleteId });
    } else {
      // LEGACY FLOW: Create guardian + athlete + link from applicant_data

      // 8️⃣.5️⃣ CREATE GUARDIAN (if minor)
      if (applicantData.is_minor && applicantData.guardian) {
        log.info("Creating guardian for minor athlete");

        const { data: guardian, error: guardianError } = await supabaseAdmin
          .from("guardians")
          .insert({
            tenant_id: targetTenantId,
            full_name: applicantData.guardian.full_name,
            national_id: applicantData.guardian.national_id,
            email: applicantData.guardian.email,
            phone: applicantData.guardian.phone,
          })
          .select()
          .single();

        if (guardianError) {
          log.error("Failed to create guardian", guardianError);
          return errorResponse(
            500,
            buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
            corsHeaders,
          );
        }

        guardianId = guardian.id;
        log.info("Guardian created", { guardianId });
      }

      // 9️⃣ CREATE ATHLETE
      const { data: athlete, error: athleteError } = await supabaseAdmin
        .from("athletes")
        .insert({
          tenant_id: targetTenantId,
          profile_id: membership.applicant_profile_id,
          full_name: applicantData.full_name,
          birth_date: applicantData.birth_date,
          national_id: applicantData.national_id,
          gender: applicantData.gender,
          email: applicantData.email,
          phone: applicantData.phone,
          address_line1: applicantData.address_line1,
          address_line2: applicantData.address_line2 || null,
          city: applicantData.city,
          state: applicantData.state,
          postal_code: applicantData.postal_code,
          country: applicantData.country,
          current_academy_id: academyId || null,
          current_main_coach_id: coachId || null,
        })
        .select()
        .single();

      if (athleteError) {
        log.error("Failed to create athlete", athleteError);
        return errorResponse(
          500,
          buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
          corsHeaders,
        );
      }

      log.info("Athlete created", { athleteId: athlete.id });
      resolvedAthleteId = athlete.id;

      // 9️⃣.5️⃣ CREATE GUARDIAN LINK (if minor)
      if (guardianId && applicantData.is_minor && applicantData.guardian) {
        const { error: linkError } = await supabaseAdmin.from("guardian_links").insert({
          tenant_id: targetTenantId,
          guardian_id: guardianId,
          athlete_id: resolvedAthleteId,
          relationship: applicantData.guardian.relationship,
          is_primary: true,
        });

        if (linkError) {
          log.warn("Guardian link warning", { error: linkError.message });
        } else {
          log.info("Guardian link created", { guardianId, athleteId: resolvedAthleteId });
        }
      }
    }

    // ========================================================================
    // 🔟 CREATE USER ROLES
    // ========================================================================
    const createdRoles: string[] = [];

    for (const role of validatedRoles) {
      const { data: existingRole } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", membership.applicant_profile_id)
        .eq("tenant_id", targetTenantId)
        .eq("role", role)
        .maybeSingle();

      if (!existingRole) {
        const { error: roleError } = await supabaseAdmin.rpc("grant_user_role", {
          p_user_id: membership.applicant_profile_id,
          p_tenant_id: targetTenantId,
          p_role: role,
        });

        if (roleError) {
          log.warn("Role creation warning", { role, error: roleError.message });
        } else {
          createdRoles.push(role);
          log.info("Role created", { role, profileId: membership.applicant_profile_id });
        }
      } else {
        log.info("Role already exists, skipping", { role });
        createdRoles.push(role);
      }
    }

    // Audit log for role grants
    if (createdRoles.length > 0) {
      await supabaseAdmin.from("audit_logs").insert({
        event_type: "ROLES_GRANTED",
        tenant_id: targetTenantId,
        profile_id: adminProfileId,
        metadata: {
          target_profile_id: membership.applicant_profile_id,
          membership_id: membershipId,
          athlete_id: athlete.id,
          roles_granted: createdRoles,
          granted_by: adminProfileId,
          granted_at: new Date().toISOString(),
        },
      });
      log.info("Roles audit log created", { roles: createdRoles });
    }

    // ========================================================================
    // 1️⃣1️⃣ MOVE DOCUMENTS
    // ========================================================================
    const documentsUploaded = membership.documents_uploaded as DocumentUploaded[] | null;
    const movedDocuments: DocumentUploaded[] = [];

    if (documentsUploaded && documentsUploaded.length > 0) {
      for (const doc of documentsUploaded) {
        const oldPath = doc.storage_path;
        const fileName =
          oldPath.split("/").pop() || `${doc.type.toLowerCase()}.${doc.file_type?.split("/")[1] || "pdf"}`;
        const newPath = `${targetTenantId}/${athlete.id}/${fileName}`;

        try {
          const { error: copyError } = await supabaseAdmin.storage.from("documents").copy(oldPath, newPath);

          if (copyError) {
            log.warn("Copy warning", { oldPath, newPath, error: copyError.message });
          }

          const { error: deleteError } = await supabaseAdmin.storage.from("documents").remove([oldPath]);

          if (deleteError) {
            log.warn("Delete warning", { oldPath, error: deleteError.message });
          }

          const { error: docInsertError } = await supabaseAdmin.from("documents").insert({
            tenant_id: targetTenantId,
            athlete_id: athlete.id,
            type: doc.type,
            file_url: newPath,
            file_type: doc.file_type,
          });

          if (docInsertError) {
            log.warn("Document insert warning", { error: docInsertError.message });
          }

          movedDocuments.push({ ...doc, storage_path: newPath });
          log.info("Document moved", { oldPath, newPath });
        } catch (e) {
          log.error("Document move error", e, { oldPath });
        }
      }
    }

    // ========================================================================
    // 1️⃣2️⃣ UPDATE MEMBERSHIP TO APPROVED
    // ========================================================================
    const now = new Date();
    const startDate = now.toISOString().split("T")[0];
    const endDate = new Date(now.setFullYear(now.getFullYear() + 1)).toISOString().split("T")[0];

    // GOV-001B: Update non-lifecycle columns via direct UPDATE
    const { error: updateNonLifecycleError } = await supabaseAdmin
      .from("memberships")
      .update({
        athlete_id: athlete.id,
        start_date: startDate,
        end_date: endDate,
        academy_id: academyId || null,
        preferred_coach_id: coachId || null,
        applicant_data: null,
        documents_uploaded: movedDocuments.length > 0 ? movedDocuments : null,
      })
      .eq("id", membershipId);

    if (updateNonLifecycleError) {
      log.error("Failed to update non-lifecycle fields", updateNonLifecycleError);
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
        corsHeaders,
      );
    }

    // GOV-001B: Transition status via gatekeeper RPC
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("change_membership_state", {
      p_membership_id: membershipId,
      p_new_status: "APPROVED",
      p_reason: "admin_approval",
      p_actor_profile_id: adminProfileId,
      p_notes: reviewNotes || null,
    });

    if (rpcError) {
      log.error("Gatekeeper RPC failed", rpcError);
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
        corsHeaders,
      );
    }

    log.info("Gatekeeper RPC result", { rpcResult });

    approved = true;
    newStatus = "APPROVED";
    log.info("Membership updated to APPROVED");

    // ========================================================================
    // 1️⃣3️⃣ GENERATE DIGITAL CARD
    // ========================================================================
    let cardGenerated = false;
    try {
      const cardResponse = await supabaseAdmin.functions.invoke("generate-digital-card", {
        body: { membershipId },
      });

      if (cardResponse.error) {
        log.warn("Card generation warning", { error: cardResponse.error.message });
      } else {
        cardGenerated = true;
        log.info("Digital card generated");
      }
    } catch (e) {
      log.error("Card generation error", e);
    }

    // ========================================================================
    // 1️⃣4️⃣ NOTIFICATION ENGINE
    // ========================================================================
    const baseUrl = resolveBaseUrl(req);
    const tenantLocale = (tenant.default_locale === "en" ? "en" : "pt-BR") as SupportedLocale;

    const notificationDecision = resolveMembershipNotification({
      previousStatus,
      newStatus,
      membership: {
        id: membershipId,
        endDate,
        rejectionReason: membership.rejection_reason ?? undefined,
      },
      athlete: {
        fullName: applicantData.full_name,
        email: applicantData.email,
      },
      tenant: {
        name: tenant.name,
        slug: tenant.slug,
        defaultLocale: tenantLocale,
      },
      baseUrl,
    });

    log.info("Email engine decision", {
      shouldSend: notificationDecision.shouldSendEmail,
      templateId: shouldSend(notificationDecision) ? notificationDecision.templateId : null,
    });

    // ========================================================================
    // 1️⃣5️⃣ SEND EMAIL
    // ========================================================================
    if (shouldSend(notificationDecision)) {
      emailResult.shouldSend = true;
      emailResult.templateId = notificationDecision.templateId;

      const emailAlreadySent = membership.email_sent_for_status === "APPROVED";

      if (emailAlreadySent) {
        log.info("Email skip: already sent for status=APPROVED");
        emailResult.skippedReason = "already_sent";
      } else if (!isEmailConfigured()) {
        log.info("Email skip: RESEND_API_KEY not configured");
        emailResult.skippedReason = "resend_not_configured";
      } else {
        try {
          const resend = getEmailClient();

          const layoutData: EmailLayoutData = {
            tenantName: tenant.name,
          };

          const { subject, html } = getMembershipApprovedTemplate({
            ...layoutData,
            athleteName: notificationDecision.payload.athleteName,
            portalUrl: notificationDecision.ctaUrl,
          });

          const { error: emailError } = await resend.emails.send({
            from: DEFAULT_EMAIL_FROM,
            to: [applicantData.email],
            subject,
            html,
          });

          if (emailError) {
            throw new Error(`Resend error: ${JSON.stringify(emailError)}`);
          }

          emailResult.sent = true;
          log.info("Email sent successfully", {
            to: applicantData.email,
            templateId: notificationDecision.templateId,
          });

          await supabaseAdmin.from("audit_logs").insert({
            event_type: "EMAIL_SENT",
            tenant_id: targetTenantId,
            profile_id: adminProfileId,
            metadata: {
              template_id: notificationDecision.templateId,
              recipient_email: applicantData.email,
              membership_id: membershipId,
              status: newStatus,
              locale: notificationDecision.locale,
              sent_at: new Date().toISOString(),
            },
          });

          await supabaseAdmin.from("memberships").update({ email_sent_for_status: "APPROVED" }).eq("id", membershipId);

          log.info("Idempotency flag set", { email_sent_for_status: "APPROVED" });
        } catch (emailErr) {
          const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
          log.error("Email failed", emailErr);

          await supabaseAdmin.from("audit_logs").insert({
            event_type: "EMAIL_FAILED",
            tenant_id: targetTenantId,
            profile_id: adminProfileId,
            metadata: {
              template_id: notificationDecision.templateId,
              recipient_email: applicantData.email,
              membership_id: membershipId,
              status: newStatus,
              error: errMsg.substring(0, 500),
              occurred_at: new Date().toISOString(),
            },
          });
        }
      }
    } else {
      emailResult.skippedReason = "engine_noop";
      log.info("Email skip: engine returned shouldSendEmail=false");
    }

    // ========================================================================
    // 1️⃣6️⃣ DECISION LOG — SUCCESS
    // ========================================================================
    const actorRole = isSuperadmin ? "SUPERADMIN_GLOBAL" : "ADMIN_TENANT";
    const impersonationIdForLog = isSuperadmin ? extractImpersonationId(req, body) : null;

    await logMembershipApproved(supabaseAdmin, {
      user_id: adminProfileId,
      tenant_id: targetTenantId,
      membership_id: membershipId,
      impersonation_id: impersonationIdForLog,
      actor_role: actorRole,
      athlete_id: athlete.id,
    });

    // ========================================================================
    // 1️⃣7️⃣ AUDIT LOG — Membership Approved
    // ========================================================================
    await supabaseAdmin.from("audit_logs").insert({
      event_type: "MEMBERSHIP_APPROVED",
      tenant_id: targetTenantId,
      profile_id: adminProfileId,
      metadata: {
        membership_id: membershipId,
        athlete_id: athlete.id,
        guardian_id: guardianId,
        is_minor: applicantData.is_minor || false,
        athlete_name: applicantData.full_name,
        academy_id: academyId || null,
        coach_id: coachId || null,
        approved_by: adminProfileId,
        review_notes: reviewNotes || null,
        roles_assigned: createdRoles,
        start_date: startDate,
        end_date: endDate,
        card_generated: cardGenerated,
        email_sent: emailResult.sent,
        occurred_at: new Date().toISOString(),
      },
    });

    log.info("Audit log created", { roles: createdRoles });

    // ========================================================================
    // SUCCESS RESPONSE
    // ========================================================================
    return okResponse(
      {
        approved: true,
        membershipId,
        previousStatus,
        newStatus,
        athleteId: athlete.id,
        rolesAssigned: createdRoles,
        cardGenerated,
        email: emailResult,
      },
      corsHeaders,
      correlationId,
    );
  } catch (error: unknown) {
    log.error("Unexpected error", error);

    // Anti-enumeration: generic error response
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
      corsHeaders,
    );
  }
});
