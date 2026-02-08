import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInstitutionalDocumentValid } from "../_shared/isDocumentValid.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VerifyRequest {
  cardId: string;
  tenantSlug?: string;
}

interface VerifyResponse {
  found: boolean;
  isValid?: boolean;
  validityReason?: string | null;
  athleteName?: string;
  membershipStatus?: string;
  cardStatus?: string;
  validUntil?: string | null;
  issuedAt?: string | null;
  tenantName?: string;
  sportType?: string;
  gradingLevel?: string | null;
  gradingScheme?: string | null;
  academyName?: string | null;
  coachName?: string | null;
  hashVerified?: boolean | null;
  storedHash?: string | null;
  pdfUrl?: string | null;
  error?: string;
}

// Mask athlete name for LGPD compliance
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
    const { cardId, tenantSlug }: VerifyRequest = await req.json();

    // Validate cardId
    if (!cardId || typeof cardId !== "string") {
      return new Response(
        JSON.stringify({ found: false, error: "Missing or invalid cardId" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cardId)) {
      return new Response(
        JSON.stringify({ found: false, error: "Invalid card ID format" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Fetch digital card with status
    const { data: card, error: cardError } = await supabase
      .from("digital_cards")
      .select(
        "id, valid_until, content_hash_sha256, pdf_url, tenant_id, membership_id, created_at, status, revoked_at"
      )
      .eq("id", cardId)
      .maybeSingle();

    if (cardError) {
      console.error("Card query error:", cardError);
      return new Response(
        JSON.stringify({ found: false, error: "Verification failed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    if (!card) {
      return new Response(
        JSON.stringify({ found: false, error: "Card not found" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    // Step 2: Fetch membership with related data
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select(
        "id, status, end_date, start_date, type, athlete_id, tenant_id, preferred_coach_id, academy_id"
      )
      .eq("id", card.membership_id)
      .maybeSingle();

    if (membershipError || !membership) {
      console.error("Membership query error:", membershipError);
      return new Response(
        JSON.stringify({ found: false, error: "Card data incomplete" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    // Step 3: Fetch coach if exists
    let coachName: string | null = null;
    if (membership.preferred_coach_id) {
      const { data: coach } = await supabase
        .from("coaches")
        .select("full_name")
        .eq("id", membership.preferred_coach_id)
        .maybeSingle();
      if (coach) {
        coachName = maskName(coach.full_name);
      }
    }

    // Step 4: Fetch academy if exists
    let academyName: string | null = null;
    if (membership.academy_id) {
      const { data: academy } = await supabase
        .from("academies")
        .select("name")
        .eq("id", membership.academy_id)
        .maybeSingle();
      academyName = academy?.name || null;
    }

    // Step 5: Fetch athlete
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .select("id, full_name")
      .eq("id", membership.athlete_id)
      .maybeSingle();

    if (athleteError || !athlete) {
      console.error("Athlete query error:", athleteError);
      return new Response(
        JSON.stringify({ found: false, error: "Card data incomplete" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    // Step 6: Fetch athlete's current grading level
    let gradingLevel: string | null = null;
    let gradingScheme: string | null = null;
    const { data: latestGrading } = await supabase
      .from("athlete_gradings")
      .select(
        `
        grading_level:grading_levels(
          display_name,
          grading_scheme:grading_schemes(name)
        )
      `
      )
      .eq("athlete_id", athlete.id)
      .eq("tenant_id", membership.tenant_id)
      .order("promotion_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestGrading?.grading_level) {
      const level = latestGrading.grading_level as unknown as {
        display_name: string;
        grading_scheme?: { name: string } | { name: string }[];
      };
      gradingLevel = level.display_name;
      if (level.grading_scheme) {
        if (Array.isArray(level.grading_scheme)) {
          gradingScheme = level.grading_scheme[0]?.name || null;
        } else {
          gradingScheme = level.grading_scheme.name || null;
        }
      }
    }

    // Step 7: Fetch tenant with lifecycle_status
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, slug, sport_types, lifecycle_status")
      .eq("id", membership.tenant_id)
      .maybeSingle();

    if (tenantError || !tenant) {
      console.error("Tenant query error:", tenantError);
      return new Response(
        JSON.stringify({ found: false, error: "Card data incomplete" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    // Validate tenant slug if provided
    if (tenantSlug && tenant.slug !== tenantSlug) {
      return new Response(
        JSON.stringify({ found: false, error: "Card not found in this organization" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    // Step 8: Fetch tenant billing status
    const { data: billing } = await supabase
      .from("tenant_billing")
      .select("status")
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    const billingStatus = billing?.status || "INCOMPLETE";
    const tenantStatus = tenant.lifecycle_status || "ACTIVE";
    const cardStatus = card.status || "ACTIVE";

    // Step 9: Apply Golden Rule for validity
    const validityResult = isInstitutionalDocumentValid({
      tenantStatus,
      billingStatus,
      documentStatus: cardStatus,
      revokedAt: card.revoked_at,
    });

    // Step 10: Additional time-based check (card expiry)
    const endDate = card.valid_until || membership.end_date;
    const isExpiredByDate = endDate ? new Date(endDate) < new Date() : false;
    
    // Final validity: Golden Rule + date check + membership status
    const membershipActive = membership.status === "ACTIVE" || membership.status === "APPROVED";
    const isValid = validityResult.isValid && !isExpiredByDate && membershipActive;

    // Determine reason if invalid
    let validityReason = validityResult.reason;
    if (!validityReason && isExpiredByDate) {
      validityReason = "DOCUMENT_EXPIRED" as any;
    }
    if (!validityReason && !membershipActive) {
      validityReason = "MEMBERSHIP_NOT_ACTIVE" as any;
    }

    const issuedAt = card.created_at ? card.created_at.split("T")[0] : null;

    // Build response
    const response: VerifyResponse = {
      found: true,
      isValid,
      validityReason: isValid ? null : validityReason,
      athleteName: maskName(athlete.full_name),
      membershipStatus: membership.status,
      cardStatus,
      validUntil: endDate,
      issuedAt,
      tenantName: tenant.name,
      sportType: tenant.sport_types?.[0] || "Combat Sport",
      gradingLevel,
      gradingScheme,
      academyName,
      coachName,
      hashVerified: null,
      storedHash: card.content_hash_sha256,
      pdfUrl: card.pdf_url,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error verifying card:", error);
    return new Response(
      JSON.stringify({ found: false, error: "Internal error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
