// ============================================================================
// PI U16 — emit-institutional-event (Edge Function)
// ============================================================================
// Receives institutional events from authenticated clients and persists
// them using service_role (bypassing RLS). Fail-silent by design.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Validate auth
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

    // Verify the caller is authenticated
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

    // 2. Parse event payload
    const body = await req.json();
    const { domain, type, tenantId, metadata } = body;

    if (!domain || !type) {
      return new Response(JSON.stringify({ error: "Missing domain or type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Insert using service_role (bypasses RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    await adminClient.from("institutional_events").insert({
      domain,
      type,
      tenant_id: tenantId || null,
      actor_user_id: user.id,
      metadata: metadata || {},
    });

    // Always return success (fail-silent for caller)
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    // Fail-silent: never break caller flow
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
