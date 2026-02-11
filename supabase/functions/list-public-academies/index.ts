/**
 * 🏢 list-public-academies — Public tenant-scoped academy listing
 *
 * SECURITY (PI U7.F2 + PI A08.H2):
 * - Uses service_role for controlled data access
 * - Tenant resolved by slug (no cross-tenant enumeration)
 * - Only returns active academies from valid tenants
 * - No PII exposed (academy data is institutional/public)
 * - Fail-closed: invalid slug → empty result
 * - Anti-enumeration: institutional pagination enforced (A08.H2)
 *
 * @see docs/security/rls-vs-edge-functions.md §3
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parsePublicPagination } from "../_shared/security/publicQueryLimits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const tenantSlug = url.searchParams.get("tenant_slug");

    if (!tenantSlug || typeof tenantSlug !== "string" || tenantSlug.length > 100) {
      return new Response(
        JSON.stringify({ academies: [], error: "Missing or invalid tenant_slug" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Validate slug format (alphanumeric + hyphens only)
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(tenantSlug) && !/^[a-z0-9]$/i.test(tenantSlug)) {
      return new Response(
        JSON.stringify({ academies: [], error: "Invalid tenant slug format" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // A08.H2 — Anti-enumeration: enforce institutional pagination limits
    const pag = parsePublicPagination(req, corsHeaders);
    if (!pag.ok) return pag.response;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Resolve tenant by slug
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, lifecycle_status")
      .eq("slug", tenantSlug)
      .maybeSingle();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ academies: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Fail-closed: only serve active tenants
    if (tenant.lifecycle_status !== "ACTIVE") {
      return new Response(
        JSON.stringify({ academies: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Step 2: Fetch active academies with deterministic ordering and institutional limit
    const { data: academies, error: academiesError } = await supabase
      .from("academies")
      .select("id, name, city, state, sport_type")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .range(pag.offset, pag.offset + pag.limit - 1);

    if (academiesError) {
      return new Response(
        JSON.stringify({ academies: [], error: "Failed to fetch academies" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ academies: academies || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ academies: [], error: "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
