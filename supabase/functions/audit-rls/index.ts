/**
 * 🔐 audit-rls — Institutional RLS & SECURITY DEFINER Audit (PI-A06)
 *
 * READ-ONLY audit function. Zero mutations. Zero side effects.
 * - Detects permissive/dangerous RLS policies
 * - Detects SECURITY DEFINER functions and classifies risk
 * - Returns structured JSON report
 *
 * ACCESS: SUPERADMIN_GLOBAL only
 * SAFE GOLD: Deterministic, reexecutable, no side effects
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// RISK CLASSIFICATION — RLS POLICIES
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

const SENSITIVE_TABLES = [
  "profiles", "user_roles", "tenants", "tenant_billing",
  "memberships", "athletes", "audit_logs", "decision_logs",
  "security_events", "digital_cards", "diplomas", "documents",
];

function classifyPolicyRisk(p: PolicyRow): PolicyFinding {
  const qual = (p.qual || "").trim().toLowerCase();
  const withCheck = (p.with_check || "").trim().toLowerCase();
  const roles = p.roles || [];
  const hasAnon = roles.some(r => r === "anon" || r === "{anon}");
  const isSensitive = SENSITIVE_TABLES.includes(p.tablename);

  // CRITICAL: USING (true) or WITH CHECK (true)
  if (qual === "true" || qual === "(true)") {
    return {
      table: p.tablename, policy: p.policyname, cmd: p.cmd,
      risk: "CRITICAL",
      reason: `USING (true) exposes all rows${hasAnon ? " including to anonymous users" : ""}`,
      roles, permissive: p.permissive,
    };
  }
  if (withCheck === "true" || withCheck === "(true)") {
    return {
      table: p.tablename, policy: p.policyname, cmd: p.cmd,
      risk: "CRITICAL",
      reason: `WITH CHECK (true) allows unrestricted writes`,
      roles, permissive: p.permissive,
    };
  }

  // CRITICAL: anon access on sensitive tables
  if (hasAnon && isSensitive) {
    return {
      table: p.tablename, policy: p.policyname, cmd: p.cmd,
      risk: "CRITICAL",
      reason: `Anonymous access on sensitive table '${p.tablename}'`,
      roles, permissive: p.permissive,
    };
  }

  // CRITICAL: cmd = ALL with broad condition
  if (p.cmd === "ALL" && (!qual || qual === "true" || qual === "(true)")) {
    return {
      table: p.tablename, policy: p.policyname, cmd: p.cmd,
      risk: "CRITICAL",
      reason: `ALL command with broad or missing condition`,
      roles, permissive: p.permissive,
    };
  }

  // HIGH: No auth.uid() reference on sensitive table
  if (isSensitive && !qual.includes("auth.uid()") && !qual.includes("is_superadmin") && !qual.includes("is_tenant_admin") && !qual.includes("is_member_of_tenant") && !qual.includes("has_role") && !qual.includes("can_view")) {
    return {
      table: p.tablename, policy: p.policyname, cmd: p.cmd,
      risk: "HIGH",
      reason: `No auth.uid() or security function reference on sensitive table`,
      roles, permissive: p.permissive,
    };
  }

  // HIGH: anon access on non-sensitive table with write
  if (hasAnon && (p.cmd === "INSERT" || p.cmd === "UPDATE" || p.cmd === "DELETE")) {
    return {
      table: p.tablename, policy: p.policyname, cmd: p.cmd,
      risk: "HIGH",
      reason: `Anonymous write access (${p.cmd})`,
      roles, permissive: p.permissive,
    };
  }

  // MEDIUM: permissive when could be restrictive
  if (p.permissive === "PERMISSIVE" && (p.cmd === "UPDATE" || p.cmd === "DELETE")) {
    // Not necessarily wrong, but worth noting
    return {
      table: p.tablename, policy: p.policyname, cmd: p.cmd,
      risk: "MEDIUM",
      reason: `PERMISSIVE policy on ${p.cmd} — verify if RESTRICTIVE is more appropriate`,
      roles, permissive: p.permissive,
    };
  }

  // SAFE
  return {
    table: p.tablename, policy: p.policyname, cmd: p.cmd,
    risk: "SAFE",
    reason: `Policy has proper access controls`,
    roles, permissive: p.permissive,
  };
}

// ============================================================================
// RISK CLASSIFICATION — SECURITY DEFINER FUNCTIONS
// ============================================================================

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

function classifyDefinerRisk(f: DefinerRow): DefinerFinding {
  const def = (f.definition || "").toLowerCase();

  // CRITICAL: Dynamic SQL
  if (def.includes("execute") && (def.includes("format(") || def.includes("||"))) {
    return {
      name: f.function_name, schema: f.schema,
      risk: "CRITICAL",
      reason: "SECURITY DEFINER with dynamic SQL (EXECUTE + format/concatenation) — SQL injection risk",
    };
  }

  // HIGH: Broad UPDATE/DELETE without WHERE
  if ((def.includes("update ") || def.includes("delete ")) && !def.includes("where")) {
    return {
      name: f.function_name, schema: f.schema,
      risk: "HIGH",
      reason: "SECURITY DEFINER with UPDATE/DELETE without explicit WHERE clause",
    };
  }

  // HIGH: No search_path set
  if (!def.includes("search_path")) {
    return {
      name: f.function_name, schema: f.schema,
      risk: "HIGH",
      reason: "SECURITY DEFINER without SET search_path — path hijacking risk",
    };
  }

  // MEDIUM: Used for RLS recursion avoidance (common pattern, acceptable)
  if (def.includes("exists") && def.includes("select 1") && def.includes("auth.uid()")) {
    return {
      name: f.function_name, schema: f.schema,
      risk: "SAFE",
      reason: "RLS helper function — proper pattern for recursion avoidance",
    };
  }

  // MEDIUM: Generic definer
  if (!def.includes("-- security definer") && !def.includes("-- reason:")) {
    return {
      name: f.function_name, schema: f.schema,
      risk: "MEDIUM",
      reason: "SECURITY DEFINER without explanatory comment justifying elevation",
    };
  }

  return {
    name: f.function_name, schema: f.schema,
    risk: "SAFE",
    reason: "SECURITY DEFINER with proper scope, search_path, and justification",
  };
}

// ============================================================================
// TABLES WITHOUT RLS
// ============================================================================

interface TableRlsRow {
  tablename: string;
  rowsecurity: boolean;
}

// ============================================================================
// HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ====================================================================
    // AUTH: Only SUPERADMIN_GLOBAL
    // ====================================================================
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, code: "UNAUTHORIZED", messageKey: "auth.missing_token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) {
      return new Response(
        JSON.stringify({ ok: false, code: "UNAUTHORIZED", messageKey: "auth.invalid_token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check SUPERADMIN_GLOBAL role
    const { data: superadminRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "SUPERADMIN_GLOBAL")
      .is("tenant_id", null)
      .maybeSingle();

    if (!superadminRole) {
      return new Response(
        JSON.stringify({ ok: false, code: "FORBIDDEN", messageKey: "auth.superadmin_required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ====================================================================
    // PHASE 1: Audit RLS Policies
    // ====================================================================
    const { data: policiesRaw, error: policiesError } = await supabase.rpc(
      "audit_rls_policies"
    ).returns<PolicyRow[]>();

    // Fallback: if RPC doesn't exist, use direct query via service role
    let policies: PolicyRow[] = [];
    if (policiesError || !policiesRaw) {
      // Query pg_policies directly using the DB URL
      const dbUrl = Deno.env.get("SUPABASE_DB_URL");
      if (dbUrl) {
        const { Client } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
        const client = new Client(dbUrl);
        await client.connect();
        try {
          const result = await client.queryObject<PolicyRow>(
            `SELECT schemaname, tablename, policyname, 
                    CASE WHEN polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END as permissive,
                    ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(pol.polroles)) as roles,
                    CASE pol.polcmd 
                      WHEN 'r' THEN 'SELECT'
                      WHEN 'a' THEN 'INSERT' 
                      WHEN 'w' THEN 'UPDATE'
                      WHEN 'd' THEN 'DELETE'
                      WHEN '*' THEN 'ALL'
                    END as cmd,
                    pg_get_expr(pol.polqual, pol.polrelid) as qual,
                    pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check
             FROM pg_policy pol
             JOIN pg_class cls ON pol.polrelid = cls.oid
             JOIN pg_namespace nsp ON cls.relnamespace = nsp.oid
             WHERE nsp.nspname = 'public'
             ORDER BY cls.relname, pol.polname`
          );
          policies = result.rows as PolicyRow[];
        } finally {
          await client.end();
        }
      }
    } else {
      policies = policiesRaw;
    }

    const policyFindings = policies.map(classifyPolicyRisk);

    // ====================================================================
    // PHASE 2: Audit SECURITY DEFINER Functions
    // ====================================================================
    let definerFunctions: DefinerRow[] = [];
    {
      const dbUrl = Deno.env.get("SUPABASE_DB_URL");
      if (dbUrl) {
        const { Client } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
        const client = new Client(dbUrl);
        await client.connect();
        try {
          const result = await client.queryObject<DefinerRow>(
            `SELECT 
               n.nspname AS schema,
               p.proname AS function_name,
               pg_get_functiondef(p.oid) AS definition
             FROM pg_proc p
             JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE p.prosecdef = true
               AND n.nspname = 'public'
             ORDER BY p.proname`
          );
          definerFunctions = result.rows as DefinerRow[];
        } finally {
          await client.end();
        }
      }
    }

    const definerFindings = definerFunctions.map(classifyDefinerRisk);

    // ====================================================================
    // PHASE 3: Tables without RLS enabled
    // ====================================================================
    let tablesWithoutRls: string[] = [];
    {
      const dbUrl = Deno.env.get("SUPABASE_DB_URL");
      if (dbUrl) {
        const { Client } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
        const client = new Client(dbUrl);
        await client.connect();
        try {
          const result = await client.queryObject<TableRlsRow>(
            `SELECT c.relname as tablename, c.relrowsecurity as rowsecurity
             FROM pg_class c
             JOIN pg_namespace n ON c.relnamespace = n.oid
             WHERE n.nspname = 'public'
               AND c.relkind = 'r'
               AND c.relrowsecurity = false
             ORDER BY c.relname`
          );
          tablesWithoutRls = (result.rows as TableRlsRow[]).map(r => r.tablename);
        } finally {
          await client.end();
        }
      }
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
      },
      policies: policyFindings.filter(f => f.risk !== "SAFE"),
      securityDefinerFunctions: definerFindings.filter(f => f.risk !== "SAFE"),
      tablesWithoutRls,
      allPolicies: policyFindings,
      allDefinerFunctions: definerFindings,
    };

    return new Response(JSON.stringify(report, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[AUDIT-RLS] Unexpected error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        code: "INTERNAL_ERROR",
        messageKey: "system.internal_error",
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
