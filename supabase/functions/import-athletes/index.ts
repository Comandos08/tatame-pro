/**
 * import-athletes — Bulk Athlete Import (I-08)
 *
 * Accepts a JSON array of athlete rows (parsed from CSV on the frontend)
 * and inserts them in a single transaction. If any row fails, all fail.
 *
 * Modes:
 *   mode=validate  → dry-run: validate rows, check duplicates, return preview
 *   mode=confirm   → execute insert
 *
 * Required auth: ADMIN_TENANT or SUPERADMIN_GLOBAL for the target tenant.
 *
 * CSV expected columns (case-insensitive header):
 *   full_name*, birth_date* (YYYY-MM-DD), email*, gender* (MASCULINO|FEMININO|OUTRO),
 *   national_id, phone, city, state, country, address_line1, academy_slug
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import { RATE_LIMIT_PRESETS, buildRateLimitContext } from "../_shared/secure-rate-limiter.ts";
import { assertTenantAccess, TenantBoundaryError } from "../_shared/tenant-boundary.ts";
import { extractImpersonationId } from "../_shared/requireImpersonationIfSuperadmin.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  forbiddenResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";


interface AthleteRow {
  full_name: string;
  birth_date: string;
  email: string;
  gender: string;
  national_id?: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
  address_line1?: string;
  academy_slug?: string;
}

interface ValidationResult {
  row: number;
  data: AthleteRow;
  errors: string[];
  isDuplicate: boolean;
}

const GENDER_MAP: Record<string, string> = {
  masculino: "MALE",
  feminino: "FEMALE",
  outro: "OTHER",
  male: "MALE",
  female: "FEMALE",
  other: "OTHER",
  m: "MALE",
  f: "FEMALE",
};

function normalizeGender(raw: string): string | null {
  return GENDER_MAP[raw.toLowerCase().trim()] ?? null;
}

function validateRow(row: AthleteRow, index: number): string[] {
  const errors: string[] = [];

  if (!row.full_name?.trim()) errors.push(`Linha ${index + 1}: nome é obrigatório`);
  if (!row.email?.trim()) errors.push(`Linha ${index + 1}: email é obrigatório`);
  if (!row.birth_date?.trim()) errors.push(`Linha ${index + 1}: data de nascimento é obrigatória`);
  if (!row.gender?.trim()) errors.push(`Linha ${index + 1}: gênero é obrigatório`);

  // Validate date format
  if (row.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.birth_date.trim())) {
    errors.push(`Linha ${index + 1}: data de nascimento deve estar no formato YYYY-MM-DD`);
  }

  // Validate email format
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) {
    errors.push(`Linha ${index + 1}: email '${row.email}' é inválido`);
  }

  // Validate gender
  if (row.gender && !normalizeGender(row.gender)) {
    errors.push(`Linha ${index + 1}: gênero '${row.gender}' inválido. Use: MASCULINO, FEMININO ou OUTRO`);
  }

  return errors;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("import-athletes", correlationId);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.missing_token", false, undefined, correlationId),
        dynamicCors,
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.invalid_token", false, undefined, correlationId),
        dynamicCors,
      );
    }

    // Rate limiting: 5 imports per hour per admin (bulk op, expensive)
    const rateLimiter = RATE_LIMIT_PRESETS.importAthletes();
    const rlContext = buildRateLimitContext(req, user.id, null);
    const rlResult = await rateLimiter.check(rlContext);
    if (!rlResult.allowed) {
      log.warn("Rate limit exceeded for import-athletes", { userId: user.id });
      // Reuse the limiter's canonical envelope response (includes Retry-After,
      // RateLimit-*, and the institutional envelope shape).
      return rateLimiter.tooManyRequestsResponse(rlResult, dynamicCors, correlationId);
    }

    // Validate Content-Type (P1-29: CSV MIME type validation)
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return errorResponse(
        415,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.unsupported_media_type", false, ["Content-Type must be application/json. CSV parsing should be done client-side."], correlationId),
        dynamicCors,
      );
    }

    const body = await req.json();
    const { tenant_id, rows, mode = "validate" } = body as {
      tenant_id: string;
      rows: AthleteRow[];
      mode: "validate" | "confirm";
    };

    if (!tenant_id) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.required_field", false, ["tenant_id is required"], correlationId),
        dynamicCors,
      );
    }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.required_field", false, ["rows array is required and must not be empty"], correlationId),
        dynamicCors,
      );
    }

    if (rows.length > 500) {
      return errorResponse(
        413,
        buildErrorEnvelope(ERROR_CODES.PAYLOAD_TOO_LARGE, "validation.payload_too_large", false, ["maximum 500 rows per import batch"], correlationId),
        dynamicCors,
      );
    }

    // Tenant boundary (A04 zero-trust): validates UUID format, tenant is
    // active, user has membership OR is a SUPERADMIN with valid impersonation.
    try {
      const impersonationId = extractImpersonationId(req, body);
      await assertTenantAccess(supabaseAdmin, user.id, tenant_id, impersonationId);
    } catch (boundaryError) {
      if (boundaryError instanceof TenantBoundaryError) {
        log.warn("Tenant boundary violation", { code: boundaryError.code, userId: user.id, tenant_id });
        return forbiddenResponse(dynamicCors);
      }
      throw boundaryError;
    }

    // Role gate (additive — assertTenantAccess only checks membership exists,
    // not the specific role required for a bulk import).
    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenant_id)
      .in("role", ["ADMIN_TENANT", "SUPERADMIN_GLOBAL"])
      .maybeSingle();

    if (!roleCheck) {
      return errorResponse(
        403,
        buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.forbidden", false, ["ADMIN_TENANT or SUPERADMIN_GLOBAL required"], correlationId),
        dynamicCors,
      );
    }

    log.info("Import request", { tenant_id, rowCount: rows.length, mode });

    // ─── Validate all rows ───────────────────────────────────────────
    const allErrors: string[] = [];
    rows.forEach((row, i) => {
      const rowErrors = validateRow(row, i);
      allErrors.push(...rowErrors);
    });

    if (allErrors.length > 0) {
      return errorResponse(
        422,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.failed", false, allErrors, correlationId),
        dynamicCors,
      );
    }

    // ─── Check for duplicates (email within tenant) ─────────────────
    const emails = rows.map((r) => r.email.trim().toLowerCase());
    const { data: existingAthletes } = await supabaseAdmin
      .from("athletes")
      .select("email")
      .eq("tenant_id", tenant_id)
      .in("email", emails);

    const existingEmails = new Set((existingAthletes || []).map((a: { email: string }) => a.email.toLowerCase()));
    const duplicateRows = rows
      .map((r, i) => ({ row: i + 1, email: r.email.trim().toLowerCase() }))
      .filter((r) => existingEmails.has(r.email));

    // ─── Resolve academy IDs if provided ────────────────────────────
    const academySlugs = [...new Set(rows.filter((r) => r.academy_slug).map((r) => r.academy_slug!))];
    const academyMap = new Map<string, string>();

    if (academySlugs.length > 0) {
      const { data: academies } = await supabaseAdmin
        .from("academies")
        .select("id, slug")
        .eq("tenant_id", tenant_id)
        .in("slug", academySlugs);

      (academies || []).forEach((a: { id: string; slug: string }) => {
        academyMap.set(a.slug, a.id);
      });
    }

    // ─── Validate mode: return preview ──────────────────────────────
    const validationResults: ValidationResult[] = rows.map((row, i) => ({
      row: i + 1,
      data: row,
      errors: [],
      isDuplicate: existingEmails.has(row.email.trim().toLowerCase()),
    }));

    if (mode === "validate") {
      return okResponse(
        {
          success: true,
          mode: "validate",
          total: rows.length,
          duplicates: duplicateRows.length,
          toInsert: rows.length - duplicateRows.length,
          duplicateRows,
          validationResults,
        },
        dynamicCors,
        correlationId,
      );
    }

    // ─── Confirm mode: insert non-duplicate rows ─────────────────────
    const toInsert = rows
      .filter((r) => !existingEmails.has(r.email.trim().toLowerCase()))
      .map((row) => ({
        full_name: row.full_name.trim(),
        birth_date: row.birth_date.trim(),
        email: row.email.trim().toLowerCase(),
        gender: normalizeGender(row.gender) as "MALE" | "FEMALE" | "OTHER",
        national_id: row.national_id?.trim() || null,
        phone: row.phone?.trim() || null,
        city: row.city?.trim() || null,
        state: row.state?.trim() || null,
        country: row.country?.trim() || "BR",
        address_line1: row.address_line1?.trim() || null,
        current_academy_id: row.academy_slug ? (academyMap.get(row.academy_slug) ?? null) : null,
        tenant_id,
        status: "ACTIVE" as const,
      }));

    if (toInsert.length === 0) {
      return okResponse(
        { success: true, mode: "confirm", inserted: 0, skipped: rows.length, message: "All rows were duplicates" },
        dynamicCors,
        correlationId,
      );
    }

    const { error: insertError } = await supabaseAdmin
      .from("athletes")
      .insert(toInsert);

    if (insertError) {
      log.error("Insert failed", { error: insertError.message });
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.query_failed", false, [`insert failed: ${insertError.message}`], correlationId),
        dynamicCors,
      );
    }

    log.info("Import completed", { inserted: toInsert.length, skipped: duplicateRows.length });

    return okResponse(
      {
        success: true,
        mode: "confirm",
        inserted: toInsert.length,
        skipped: duplicateRows.length,
      },
      dynamicCors,
      correlationId,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log.error("Import failed", { error: message });
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, [message], correlationId),
      dynamicCors,
    );
  }
});
