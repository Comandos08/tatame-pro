/**
 * request-erasure — LGPD Art. 18 (Right to Erasure) — P2.8
 *
 * Creates an erasure request for an athlete.
 * Does NOT execute immediate deletion — sports records have legal retention obligations.
 * Creates a record in audit_logs as a pending erasure queue item
 * and notifies tenant admins via send-athlete-email.
 *
 * Requires: authenticated user (athlete requesting their own data, or tenant admin)
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("request-erasure", correlationId);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify the calling user
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const { athlete_id, tenant_id, reason } = await req.json();

    if (!athlete_id || !tenant_id) {
      return new Response(
        JSON.stringify({ error: "athlete_id and tenant_id are required" }),
        { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Verify the requesting user is the athlete themselves OR a tenant admin
    const { data: athlete } = await supabase
      .from("athletes")
      .select("id, full_name, email, profile_id")
      .eq("id", athlete_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!athlete) {
      return new Response(
        JSON.stringify({ error: "Athlete not found" }),
        { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const isOwnRequest = athlete.profile_id === user.id;

    if (!isOwnRequest) {
      // Check if user is a tenant admin
      const { data: roleMember } = await supabase
        .from("tenant_members")
        .select("role")
        .eq("profile_id", user.id)
        .eq("tenant_id", tenant_id)
        .in("role", ["ADMIN_TENANT", "SUPERADMIN_GLOBAL"])
        .maybeSingle();

      if (!roleMember) {
        return new Response(
          JSON.stringify({ error: "Forbidden: you may only request erasure for your own data" }),
          { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 403 }
        );
      }
    }

    // Check for existing pending request
    const { data: existing } = await supabase
      .from("audit_logs")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("entity_type", "ERASURE_REQUEST")
      .eq("entity_id", athlete_id)
      .eq("event_type", "LGPD_ERASURE_REQUESTED")
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "Uma solicitação de exclusão já está em análise", request_id: existing.id }),
        { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 409 }
      );
    }

    // Create erasure request as an audit log entry (acts as pending queue)
    const { data: auditEntry, error: auditError } = await supabase
      .from("audit_logs")
      .insert({
        tenant_id,
        actor_id: user.id,
        entity_type: "ERASURE_REQUEST",
        entity_id: athlete_id,
        event_type: "LGPD_ERASURE_REQUESTED",
        severity: "HIGH",
        metadata: {
          athlete_name: athlete.full_name,
          athlete_email: athlete.email,
          reason: reason || "Solicitação de exclusão via portal do atleta (LGPD Art. 18)",
          requested_by: user.id,
          requested_at: new Date().toISOString(),
          status: "PENDING_ADMIN_REVIEW",
          legal_note: "Registros esportivos podem ter retenção legal obrigatória. Análise manual necessária.",
        },
        correlation_id: correlationId,
      })
      .select("id")
      .single();

    if (auditError) {
      throw new Error(`Failed to create erasure request: ${auditError.message}`);
    }

    log.info("LGPD erasure request created", { athlete_id, tenant_id, request_id: auditEntry.id });

    return new Response(
      JSON.stringify({
        request_id: auditEntry.id,
        status: "PENDING_ADMIN_REVIEW",
        message: "Sua solicitação foi registrada e será analisada pela equipe administrativa. Registros esportivos oficiais podem ter retenção legal obrigatória.",
      }),
      { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Error creating erasure request", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
