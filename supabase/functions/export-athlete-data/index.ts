/**
 * export-athlete-data — LGPD Art. 18 — Portabilidade de Dados
 *
 * Permite ao atleta exportar todos os seus dados pessoais armazenados
 * na plataforma, conforme exigido pela Lei Geral de Proteção de Dados
 * Pessoais (LGPD, Lei nº 13.709/2018), Art. 18, inciso V.
 *
 * Acesso: Atleta autenticado (próprios dados) ou Admin do tenant.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { createAuditLog } from "../_shared/audit-logger.ts";
import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("export-athlete-data", correlationId);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Authenticate the requesting user
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const url = new URL(req.url);
    const athleteId = url.searchParams.get("athlete_id");
    const tenantId = url.searchParams.get("tenant_id");

    if (!athleteId || !tenantId) {
      return new Response(JSON.stringify({ error: "athlete_id and tenant_id are required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    log.info("Export requested", { athleteId, tenantId, requestingUser: user.id });

    // Verify requester is the athlete (via profile_id) or an admin of the tenant
    const { data: athleteRecord, error: athleteCheckError } = await supabaseAdmin
      .from("athletes")
      .select("id, profile_id, full_name")
      .eq("id", athleteId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (athleteCheckError || !athleteRecord) {
      return new Response(JSON.stringify({ error: "Athlete not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    const isOwnData = athleteRecord.profile_id === user.id;

    if (!isOwnData) {
      // Check if requester is admin of this tenant
      const { data: roleCheck } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .in("role", ["ADMIN_TENANT", "STAFF_ORGANIZACAO", "SUPERADMIN_GLOBAL"])
        .maybeSingle();

      if (!roleCheck) {
        return new Response(JSON.stringify({ error: "Access denied" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }
    }

    // ─── Collect all data ───────────────────────────────────────────

    const [
      athleteData,
      membershipsData,
      gradingsData,
      diplomasData,
      eventRegistrationsData,
      badgesData,
    ] = await Promise.all([
      // Personal data
      supabaseAdmin
        .from("athletes")
        .select("id, full_name, email, phone, birth_date, gender, national_id, city, state, country, address_line1, address_line2, postal_code, created_at, updated_at")
        .eq("id", athleteId)
        .eq("tenant_id", tenantId)
        .maybeSingle(),

      // Memberships
      supabaseAdmin
        .from("memberships")
        .select("id, status, type, start_date, end_date, payment_status, created_at")
        .eq("athlete_id", athleteId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),

      // Graduations
      supabaseAdmin
        .from("athlete_gradings")
        .select("id, promotion_date, notes, is_official, created_at, grading_levels:grading_level_id(code, display_name), academies:academy_id(name)")
        .eq("athlete_id", athleteId)
        .eq("tenant_id", tenantId)
        .order("promotion_date", { ascending: false }),

      // Diplomas
      supabaseAdmin
        .from("diplomas")
        .select("id, serial_number, status, is_official, promotion_date, created_at, grading_levels:grading_level_id(display_name)")
        .eq("athlete_id", athleteId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),

      // Event registrations
      supabaseAdmin
        .from("event_registrations")
        .select("id, status, created_at, events:event_id(name, start_date, location)")
        .eq("athlete_id", athleteId)
        .order("created_at", { ascending: false }),

      // Badges
      supabaseAdmin
        .from("athlete_badges")
        .select("id, awarded_at, badge_catalog:badge_id(name, description)")
        .eq("athlete_id", athleteId)
        .eq("is_active", true)
        .order("awarded_at", { ascending: false }),
    ]);

    const exportPayload = {
      exported_at: new Date().toISOString(),
      export_version: "1.0",
      legal_basis: "LGPD Art. 18, V — Direito à Portabilidade de Dados",
      tenant_id: tenantId,
      personal_data: athleteData.data ?? null,
      memberships: membershipsData.data ?? [],
      graduations: gradingsData.data ?? [],
      diplomas: diplomasData.data ?? [],
      event_registrations: eventRegistrationsData.data ?? [],
      badges: badgesData.data ?? [],
    };

    // Audit the export
    await createAuditLog(supabaseAdmin, {
      actor_id: user.id,
      tenant_id: tenantId,
      event_type: "ATHLETE_DATA_EXPORTED",
      target_type: "athlete",
      target_id: athleteId,
      metadata: {
        requested_by: user.id,
        is_own_data: isOwnData,
        athlete_name: athleteRecord.full_name,
        export_version: "1.0",
      },
    });

    log.info("Export completed", { athleteId, sections: Object.keys(exportPayload) });

    const filename = `tatame-dados-atleta-${athleteId.substring(0, 8)}-${new Date().toISOString().split("T")[0]}.json`;

    return new Response(JSON.stringify(exportPayload, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log.error("Export failed", { error: message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
