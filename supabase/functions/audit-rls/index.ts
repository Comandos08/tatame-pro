/**
 * 🔐 audit-rls — Institutional RLS & SECURITY DEFINER Audit (PI-A06 SAFE GOLD)
 *
 * READ-ONLY audit function. Zero mutations. Zero side effects.
 * - Detects permissive/dangerous RLS policies
 * - Detects SECURITY DEFINER functions and classifies risk
 * - Returns structured JSON report
 *
 * ACCESS: SUPERADMIN_GLOBAL only
 * DATA SOURCE: Exclusively via supabase.rpc() — no direct DB connections
 * SAFE GOLD: Deterministic, reexecutable, no side effects
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildErrorEnvelope,
  errorResponse,
  ERROR_CODES,
  unauthorizedResponse,
  forbiddenResponse,
  rpcErrorResponse,
} from "../_shared/errors/envelope.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";


// ============================================================================
// TYPES
// ============================================================================

interface PolicyRow {
  schemaname: string;
  tablename: string;
  policyname: string;
  permissive: string;
  roles: string[];
  cmd: string;
  qual: string | null;
  with_check: string | null;
}

interface PolicyFinding {
  table: string;
  policy: string;
  cmd: string;
  risk: "CRITICAL" | "HIGH" | "MEDIUM" | "SAFE";
  reason: string;
  roles: string[];
  permissive: string;
}

interface DefinerRow {
  schema: string;
  function_name: string;
  definition: string;
}

interface DefinerFinding {
  name: string;
  schema: string;
  risk: "CRITICAL" | "HIGH" | "MEDIUM" | "SAFE";
  reason: string;
}

interface AnonPolicyRow {
  schemaname: string;
  tablename: string;
  policyname: string;
  cmd: string;
  permissive: string;
  roles: string[];
  qual: string | null;
  with_check: string | null;
}

interface PiiExposureFinding {
  table: string;
  policy: string;
  cmd: string;
  risk: "CRITICAL" | "HIGH" | "SAFE";
  reason: string;
}

// ============================================================================
// PII CONTRACT — Explicit lists (mirrors src/domain/security/piiContract.ts)
// ============================================================================

const PII_SENSITIVE_TABLES = new Set([
  "profiles",
  "user_roles",
  "memberships",
  "athletes",
  "guardians",
  "guardian_links",
  "coaches",
  "audit_logs",
  "decision_logs",
  "security_events",
  "digital_cards",
  "diplomas",
  "documents",
  "password_resets",
  "superadmin_impersonations",
  "tenant_billing",
  "tenant_invoices",
  "webhook_events",
]);

const PII_PUBLIC_SAFE_TABLES = new Set([
  "platform_landing_config",
  "platform_partners",
  "billing_environment_config",
  "feature_access",
]);

function classifyAnonAccess(tablename: string, cmd: string, policyname: string): PiiExposureFinding {
  const isWrite = cmd === "INSERT" || cmd === "UPDATE" || cmd === "DELETE" || cmd === "ALL";

  if (isWrite) {
    return {
      table: tablename,
      policy: policyname,
      cmd,
      risk: "CRITICAL",
      reason: `Anonymous ${cmd} access — potential data mutation`,
    };
  }
  if (PII_SENSITIVE_TABLES.has(tablename)) {
    return {
      table: tablename,
      policy: policyname,
      cmd,
      risk: "CRITICAL",
      reason: `Anonymous SELECT on sensitive PII table '${tablename}'`,
    };
  }
  if (!PII_PUBLIC_SAFE_TABLES.has(tablename)) {
    return {
      table: tablename,
      policy: policyname,
      cmd,
      risk: "HIGH",
      reason: `Anonymous SELECT on '${tablename}' not in PUBLIC_SAFE_TABLES`,
    };
  }
  return {
    table: tablename,
    policy: policyname,
    cmd,
    risk: "SAFE",
    reason: "Anonymous SELECT on explicitly public table",
  };
}

// ============================================================================
// RISK CLASSIFICATION — RLS POLICIES
// ============================================================================

const SENSITIVE_TABLES = [
  "profiles",
  "user_roles",
  "tenants",
  "tenant_billing",
  "memberships",
  "athletes",
  "audit_logs",
  "decision_logs",
  "security_events",
  "digital_cards",
  "diplomas",
  "documents",
];

function classifyPolicyRisk(p: PolicyRow): PolicyFinding {
  const qual = (p.qual || "").trim().toLowerCase();
  const withCheck = (p.with_check || "").trim().toLowerCase();
  const roles = p.roles || [];
  const hasAnon = roles.some((r) => r === "anon" || r === "{anon}");
  const isSensitive = SENSITIVE_TABLES.includes(p.tablename);

  // CRITICAL: USING (true) or WITH CHECK (true)
  if (qual === "true" || qual === "(true)") {
    return {
      table: p.tablename,
      policy: p.policyname,
      cmd: p.cmd,
      risk: "CRITICAL",
      reason: `USING (true) exposes all rows${hasAnon ? " including to anonymous users" : ""}`,
      roles,
      permissive: p.permissive,
    };
  }
  if (withCheck === "true" || withCheck === "(true)") {
    return {
      table: p.tablename,
      policy: p.policyname,
      cmd: p.cmd,
      risk: "CRITICAL",
      reason: `WITH CHECK (true) allows unrestricted writes`,
      roles,
      permissive: p.permissive,
    };
  }

  // CRITICAL: anon access on sensitive tables
  if (hasAnon && isSensitive) {
    return {
      table: p.tablename,
      policy: p.policyname,
      cmd: p.cmd,
      risk: "CRITICAL",
      reason: `Anonymous access on sensitive table '${p.tablename}'`,
      roles,
      permissive: p.permissive,
    };
  }

  // CRITICAL: cmd = ALL with broad condition
  if (p.cmd === "ALL" && (!qual || qual === "true" || qual === "(true)")) {
    return {
      table: p.tablename,
      policy: p.policyname,
      cmd: p.cmd,
      risk: "CRITICAL",
      reason: `ALL command with broad or missing condition`,
      roles,
      permissive: p.permissive,
    };
  }

  // HIGH: No auth.uid() reference on sensitive table
  if (
    isSensitive &&
    !qual.includes("auth.uid()") &&
    !qual.includes("is_superadmin") &&
    !qual.includes("is_tenant_admin") &&
    !qual.includes("is_member_of_tenant") &&
    !qual.includes("has_role") &&
    !qual.includes("can_view")
  ) {
    return {
      table: p.tablename,
      policy: p.policyname,
      cmd: p.cmd,
      risk: "HIGH",
      reason: `No auth.uid() or security function reference on sensitive table`,
      roles,
      permissive: p.permissive,
    };
  }

  // HIGH: anon access with write
  if (hasAnon && (p.cmd === "INSERT" || p.cmd === "UPDATE" || p.cmd === "DELETE")) {
    return {
      table: p.tablename,
      policy: p.policyname,
      cmd: p.cmd,
      risk: "HIGH",
      reason: `Anonymous write access (${p.cmd})`,
      roles,
      permissive: p.permissive,
    };
  }

  // MEDIUM: permissive on write operations
  if (p.permissive === "PERMISSIVE" && (p.cmd === "UPDATE" || p.cmd === "DELETE")) {
    return {
      table: p.tablename,
      policy: p.policyname,
      cmd: p.cmd,
      risk: "MEDIUM",
      reason: `PERMISSIVE policy on ${p.cmd} — verify if RESTRICTIVE is more appropriate`,
      roles,
      permissive: p.permissive,
    };
  }

  // SAFE
  return {
    table: p.tablename,
    policy: p.policyname,
    cmd: p.cmd,
    risk: "SAFE",
    reason: `Policy has proper access controls`,
    roles,
    permissive: p.permissive,
  };
}

// ============================================================================
// RISK CLASSIFICATION — SECURITY DEFINER FUNCTIONS
// ============================================================================

function classifyDefinerRisk(f: DefinerRow): DefinerFinding {
  const def = (f.definition || "").toLowerCase();

  // CRITICAL: Dynamic SQL
  if (def.includes("execute") && (def.includes("format(") || def.includes("||"))) {
    return {
      name: f.function_name,
      schema: f.schema,
      risk: "CRITICAL",
      reason: "SECURITY DEFINER with dynamic SQL (EXECUTE + format/concatenation) — SQL injection risk",
    };
  }

  // HIGH: Broad UPDATE/DELETE without WHERE
  if ((def.includes("update ") || def.includes("delete ")) && !def.includes("where")) {
    return {
      name: f.function_name,
      schema: f.schema,
      risk: "HIGH",
      reason: "SECURITY DEFINER with UPDATE/DELETE without explicit WHERE clause",
    };
  }

  // HIGH: No search_path set
  if (!def.includes("search_path")) {
    return {
      name: f.function_name,
      schema: f.schema,
      risk: "HIGH",
      reason: "SECURITY DEFINER without SET search_path — path hijacking risk",
    };
  }

  // SAFE: RLS helper pattern
  if (def.includes("exists") && def.includes("select 1") && def.includes("auth.uid()")) {
    return {
      name: f.function_name,
      schema: f.schema,
      risk: "SAFE",
      reason: "RLS helper function — proper pattern for recursion avoidance",
    };
  }

  // MEDIUM: No explanatory comment
  if (!def.includes("-- security definer") && !def.includes("-- reason:")) {
    return {
      name: f.function_name,
      schema: f.schema,
      risk: "MEDIUM",
      reason: "SECURITY DEFINER without explanatory comment justifying elevation",
    };
  }

  return {
    name: f.function_name,
    schema: f.schema,
    risk: "SAFE",
    reason: "SECURITY DEFINER with proper scope, search_path, and justification",
  };
}

// ============================================================================
// HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("audit-rls", correlationId);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ====================================================================
    // AUTH: Only SUPERADMIN_GLOBAL
    // ====================================================================
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return unauthorizedResponse(dynamicCors, "auth.missing_token");
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) {
      return unauthorizedResponse(dynamicCors, "auth.invalid_token");
    }

    const { data: superadminRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "SUPERADMIN_GLOBAL")
      .is("tenant_id", null)
      .maybeSingle();

    if (!superadminRole) {
      return forbiddenResponse(dynamicCors, "auth.superadmin_required");
    }

    // ====================================================================
    // PHASE 1: Audit RLS Policies (via RPC) — USANDO VERSÃO SUPERADMIN
    // ====================================================================
    const { data: policies, error: policiesError } = await supabase.rpc("audit_rls_snapshot_superadmin");

    if (policiesError) {
      log.error("[AUDIT-RLS] RPC audit_rls_snapshot_superadmin failed:", policiesError.message);
      return rpcErrorResponse(dynamicCors, "audit_rls_snapshot_superadmin", policiesError.message);
    }

    const policyFindings = (policies as PolicyRow[]).map(classifyPolicyRisk);

    // ====================================================================
    // PHASE 2: Audit SECURITY DEFINER Functions (via RPC) — USANDO VERSÃO SUPERADMIN
    // ====================================================================
    const { data: definers, error: definersError } = await supabase.rpc("audit_security_definer_snapshot_superadmin");

    if (definersError) {
      log.error("[AUDIT-RLS] RPC audit_security_definer_snapshot_superadmin failed:", definersError.message);
      return rpcErrorResponse(dynamicCors, "audit_security_definer_snapshot_superadmin", definersError.message);
    }

    const definerFindings = (definers as DefinerRow[]).map(classifyDefinerRisk);

    // ====================================================================
    // PHASE 3: Tables Without RLS (via RPC) — USANDO VERSÃO SUPERADMIN
    // ====================================================================
    const { data: tablesNoRls, error: tablesError } = await supabase.rpc("audit_tables_without_rls_superadmin");

    if (tablesError) {
      log.error("[AUDIT-RLS] RPC audit_tables_without_rls_superadmin failed:", tablesError.message);
      return rpcErrorResponse(dynamicCors, "audit_tables_without_rls_superadmin", tablesError.message);
    }

    const tablesWithoutRls = (tablesNoRls as { tablename: string }[]).map((r) => r.tablename);

    // ====================================================================
    // PHASE 4: PII Exposure Audit — Anon Access Snapshot (PI-A08) — USANDO VERSÃO SUPERADMIN
    // ====================================================================
    let piiExposure: PiiExposureFinding[] = [];
    let piiExposureError = false;
    try {
      const { data: anonPolicies, error: anonError } = await supabase.rpc("audit_public_access_snapshot_superadmin");

      if (anonError) {
        log.warn("[AUDIT-RLS] RPC audit_public_access_snapshot_superadmin failed (non-fatal):", anonError.message);
        piiExposureError = true;
      } else if (anonPolicies) {
        const policies_arr = Array.isArray(anonPolicies) ? anonPolicies : (anonPolicies as unknown as AnonPolicyRow[]);
        piiExposure = (policies_arr as AnonPolicyRow[]).map((p) =>
          classifyAnonAccess(p.tablename, p.cmd, p.policyname),
        );
      }
    } catch {
      log.warn("[AUDIT-RLS] PII exposure audit failed unexpectedly (non-fatal)");
      piiExposureError = true;
    }

    const piiCounts = { critical: 0, high: 0, safe: 0 };
    for (const f of piiExposure) {
      piiCounts[f.risk.toLowerCase() as keyof typeof piiCounts]++;
    }

    // ====================================================================
    // BUILD REPORT
    // ====================================================================
    const policyCounts = { critical: 0, high: 0, medium: 0, safe: 0 };
    for (const f of policyFindings) {
      policyCounts[f.risk.toLowerCase() as keyof typeof policyCounts]++;
    }

    const definerCounts = { critical: 0, high: 0, medium: 0, safe: 0 };
    for (const f of definerFindings) {
      definerCounts[f.risk.toLowerCase() as keyof typeof definerCounts]++;
    }

    const report = {
      ok: true,
      timestamp: new Date().toISOString(),
      summary: {
        policies: {
          total: policyFindings.length,
          ...policyCounts,
        },
        securityDefinerFunctions: {
          total: definerFindings.length,
          ...definerCounts,
        },
        tablesWithoutRls: tablesWithoutRls.length,
        piiExposure: {
          total: piiExposure.length,
          ...piiCounts,
        },
      },
      piiExposureError,
      policies: policyFindings.filter((f) => f.risk !== "SAFE"),
      securityDefinerFunctions: definerFindings.filter((f) => f.risk !== "SAFE"),
      tablesWithoutRls,
      piiExposure: piiExposure.filter((f) => f.risk !== "SAFE"),
      allPolicies: policyFindings,
      allDefinerFunctions: definerFindings,
      allPiiExposure: piiExposure,
    };

    return new Response(JSON.stringify(report, null, 2), {
      status: 200,
      headers: { ...dynamicCors, "Content-Type": "application/json" },
    });
  } catch (error) {
    log.error("[AUDIT-RLS] Unexpected error:", error);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false),
      dynamicCors,
    );
  }
});
