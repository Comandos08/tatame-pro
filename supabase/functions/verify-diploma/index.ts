/**
 * 🎓 verify-diploma — Public diploma verification via Edge Function
 *
 * SECURITY (PI U7):
 * - Uses service_role for bypass of RLS (controlled lookup)
 * - Single-item lookup by UUID (no enumeration)
 * - UUID regex validation before query
 * - LGPD: athlete name masked, coach name masked
 * - No authentication required (public verification endpoint)
 * - Institutional validity check (tenant status + billing)
 *
 * @see docs/security/rls-vs-edge-functions.md §3 (Verificação pública)
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInstitutionalDocumentValid } from "../_shared/isDocumentValid.ts";
import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";


interface VerifyDiplomaRequest {
  diplomaId: string;
  tenantSlug?: string;
}

// Mask name for LGPD compliance: "João Silva" → "João S."
const maskName = (name: string): string => {
  const parts = name.split(" ");
  return parts.length > 1
    ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`
    : parts[0];
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { diplomaId, tenantSlug }: VerifyDiplomaRequest = await req.json();

    // Validate diplomaId
    if (!diplomaId || typeof diplomaId !== "string") {
      return new Response(
        JSON.stringify({ found: false, error: "Missing or invalid diplomaId" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Validate UUID format (anti-enumeration)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(diplomaId)) {
      return new Response(
        JSON.stringify({ found: false, error: "Invalid diploma ID format" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Fetch diploma by ID (single-item lookup)
    const { data: diploma, error: diplomaError } = await supabase
      .from("diplomas")
      .select(`
        id, serial_number, status, promotion_date, issued_at,
        content_hash_sha256, pdf_url, tenant_id, athlete_id,
        grading_level_id, academy_id, coach_id, revoked_at
      `)
      .eq("id", diplomaId)
      .maybeSingle();

    if (diplomaError || !diploma) {
      return new Response(
        JSON.stringify({ found: false, error: "Diploma not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Step 2: Fetch tenant
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, slug, lifecycle_status")
      .eq("id", diploma.tenant_id)
      .maybeSingle();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ found: false, error: "Diploma data incomplete" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Validate tenant slug if provided
    if (tenantSlug && tenant.slug !== tenantSlug) {
      return new Response(
        JSON.stringify({ found: false, error: "Diploma not found in this organization" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Step 3: Fetch athlete
    const { data: athlete } = await supabase
      .from("athletes")
      .select("id, full_name")
      .eq("id", diploma.athlete_id)
      .maybeSingle();

    if (!athlete) {
      return new Response(
        JSON.stringify({ found: false, error: "Diploma data incomplete" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Step 4: Fetch grading level + scheme
    const { data: gradingLevel } = await supabase
      .from("grading_levels")
      .select("id, display_name, code, grading_scheme_id")
      .eq("id", diploma.grading_level_id)
      .maybeSingle();

    let schemeName: string | null = null;
    let sportType: string | null = null;
    if (gradingLevel) {
      const { data: scheme } = await supabase
        .from("grading_schemes")
        .select("name, sport_type")
        .eq("id", gradingLevel.grading_scheme_id)
        .maybeSingle();
      schemeName = scheme?.name || null;
      sportType = scheme?.sport_type || null;
    }

    // Step 5: Fetch academy (optional)
    let academyName: string | null = null;
    if (diploma.academy_id) {
      const { data: academy } = await supabase
        .from("academies")
        .select("name")
        .eq("id", diploma.academy_id)
        .maybeSingle();
      academyName = academy?.name || null;
    }

    // Step 6: Fetch coach (optional)
    let coachName: string | null = null;
    if (diploma.coach_id) {
      const { data: coach } = await supabase
        .from("coaches")
        .select("full_name")
        .eq("id", diploma.coach_id)
        .maybeSingle();
      if (coach) {
        coachName = maskName(coach.full_name);
      }
    }

    // Step 7: Fetch billing status for institutional validity
    const { data: billing } = await supabase
      .from("tenant_billing")
      .select("status")
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    const billingStatus = billing?.status || "INCOMPLETE";
    const tenantStatus = tenant.lifecycle_status || "ACTIVE";

    // Step 8: Apply institutional validity Golden Rule
    const validityResult = isInstitutionalDocumentValid({
      tenantStatus,
      billingStatus,
      documentStatus: diploma.status,
      revokedAt: diploma.revoked_at,
    });

    const isValid = validityResult.isValid && diploma.status === "ISSUED";

    // Step 9: Build response with masked data
    return new Response(
      JSON.stringify({
        found: true,
        isValid,
        validityReason: isValid ? null : (validityResult.reason || "DOCUMENT_NOT_ISSUED"),
        athleteName: maskName(athlete.full_name),
        status: diploma.status,
        levelName: gradingLevel?.display_name || null,
        levelCode: gradingLevel?.code || null,
        schemeName,
        sportType,
        promotionDate: diploma.promotion_date,
        serialNumber: diploma.serial_number,
        tenantName: tenant.name,
        academyName,
        coachName,
        storedHash: diploma.content_hash_sha256,
        pdfUrl: diploma.pdf_url,
        issuedAt: diploma.issued_at ? diploma.issued_at.split("T")[0] : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ found: false, error: "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
