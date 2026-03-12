// ============================================================================
// PI U15 — resolve-feature-flags (Edge Function)
// ============================================================================
// Resolves institutional feature flags for a tenant.
// Global flags + tenant overrides → final boolean map.
// Fail-safe: error → all flags false.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { tenantId } = body;

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Missing tenantId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch flags using service_role
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: records, error: fetchError } = await adminClient
      .from("institutional_feature_flags")
      .select("flag, enabled, tenant_id")
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);

    if (fetchError || !records) {
      // Fail-safe: return empty map (all false)
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve: globals first, then tenant overrides
    const flagMap: Record<string, boolean> = {};
    for (const rec of records) {
      if (rec.tenant_id === null) {
        flagMap[rec.flag] = rec.enabled;
      }
    }
    for (const rec of records) {
      if (rec.tenant_id === tenantId) {
        flagMap[rec.flag] = rec.enabled;
      }
    }

    return new Response(JSON.stringify(flagMap), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    // Fail-safe
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
