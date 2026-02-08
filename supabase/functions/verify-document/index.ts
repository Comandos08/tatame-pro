import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInstitutionalDocumentValid } from "../_shared/isDocumentValid.ts";

/**
 * PI-D3-DOCS1.0: Public Document Verification Endpoint
 * 
 * This endpoint verifies institutional documents using opaque tokens.
 * It applies the Golden Rule for validity and returns minimal public data.
 * 
 * Security:
 * - Token is opaque (UUID v4, not enumerable)
 * - No internal IDs exposed
 * - No billing details exposed
 * - LGPD-compliant name masking
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VerifyRequest {
  token: string;
}

type VerifyResponse =
  | {
      valid: true;
      document_type: "digital_card" | "diploma";
      holder_name: string;
      issuer_name: string;
      status_label: "VALID";
      issued_at: string;
      // Additional fields for card display (not IDs)
      sport_type?: string;
      grading_level?: string;
      valid_until?: string | null;
    }
  | {
      valid: false;
      status_label: "INVALID" | "REVOKED" | "NOT_FOUND";
    };

// Mask name for LGPD compliance: "João Silva Santos" → "João S."
const maskName = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || "";
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token }: VerifyRequest = await req.json();

    // Validate token format
    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ valid: false, status_label: "NOT_FOUND" } as VerifyResponse),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200, // Always 200 for public endpoints (SAFE GOLD)
        }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      return new Response(
        JSON.stringify({ valid: false, status_label: "NOT_FOUND" } as VerifyResponse),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Fetch token from document_public_tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from("document_public_tokens")
      .select("token, document_type, document_id, tenant_id, revoked_at")
      .eq("token", token)
      .maybeSingle();

    if (tokenError) {
      console.error("Token query error:", tokenError);
      return new Response(
        JSON.stringify({ valid: false, status_label: "NOT_FOUND" } as VerifyResponse),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    if (!tokenData) {
      return new Response(
        JSON.stringify({ valid: false, status_label: "NOT_FOUND" } as VerifyResponse),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Step 2: Check if token is revoked
    if (tokenData.revoked_at) {
      return new Response(
        JSON.stringify({ valid: false, status_label: "REVOKED" } as VerifyResponse),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Step 3: Fetch tenant with lifecycle_status
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, lifecycle_status, sport_types")
      .eq("id", tokenData.tenant_id)
      .maybeSingle();

    if (tenantError || !tenant) {
      console.error("Tenant query error:", tenantError);
      return new Response(
        JSON.stringify({ valid: false, status_label: "NOT_FOUND" } as VerifyResponse),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Step 4: Fetch tenant billing
    const { data: billing } = await supabase
      .from("tenant_billing")
      .select("status")
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    const billingStatus = billing?.status || "INCOMPLETE";
    const tenantStatus = tenant.lifecycle_status || "ACTIVE";

    // Step 5: Resolve document based on type
    let holderName = "";
    let documentStatus = "";
    let documentRevokedAt: string | null = null;
    let issuedAt = "";
    let gradingLevel: string | null = null;
    let validUntil: string | null = null;

    if (tokenData.document_type === "digital_card") {
      // Fetch digital card
      const { data: card, error: cardError } = await supabase
        .from("digital_cards")
        .select("id, status, revoked_at, created_at, valid_until, membership_id")
        .eq("id", tokenData.document_id)
        .maybeSingle();

      if (cardError || !card) {
        console.error("Card query error:", cardError);
        return new Response(
          JSON.stringify({ valid: false, status_label: "NOT_FOUND" } as VerifyResponse),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }

      documentStatus = card.status || "ACTIVE";
      documentRevokedAt = card.revoked_at;
      issuedAt = card.created_at?.split("T")[0] || "";
      validUntil = card.valid_until;

      // Fetch membership → athlete
      const { data: membership } = await supabase
        .from("memberships")
        .select("athlete_id")
        .eq("id", card.membership_id)
        .maybeSingle();

      if (membership?.athlete_id) {
        const { data: athlete } = await supabase
          .from("athletes")
          .select("full_name")
          .eq("id", membership.athlete_id)
          .maybeSingle();
        holderName = athlete?.full_name || "";

        // Fetch latest grading
        const { data: grading } = await supabase
          .from("athlete_gradings")
          .select(`
            grading_level:grading_levels(display_name)
          `)
          .eq("athlete_id", membership.athlete_id)
          .eq("tenant_id", tenant.id)
          .order("promotion_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (grading?.grading_level) {
          const level = grading.grading_level as unknown as { display_name: string };
          gradingLevel = level.display_name;
        }
      }
    } else if (tokenData.document_type === "diploma") {
      // Fetch diploma
      const { data: diploma, error: diplomaError } = await supabase
        .from("diplomas")
        .select("id, status, revoked_at, issued_at, athlete_id, grading_level_id")
        .eq("id", tokenData.document_id)
        .maybeSingle();

      if (diplomaError || !diploma) {
        console.error("Diploma query error:", diplomaError);
        return new Response(
          JSON.stringify({ valid: false, status_label: "NOT_FOUND" } as VerifyResponse),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }

      documentStatus = diploma.status || "ISSUED";
      documentRevokedAt = diploma.revoked_at;
      issuedAt = diploma.issued_at?.split("T")[0] || "";

      // Fetch athlete
      const { data: athlete } = await supabase
        .from("athletes")
        .select("full_name")
        .eq("id", diploma.athlete_id)
        .maybeSingle();
      holderName = athlete?.full_name || "";

      // Fetch grading level
      const { data: level } = await supabase
        .from("grading_levels")
        .select("display_name")
        .eq("id", diploma.grading_level_id)
        .maybeSingle();
      gradingLevel = level?.display_name || null;
    }

    // Step 6: Apply Golden Rule
    const validityResult = isInstitutionalDocumentValid({
      tenantStatus,
      billingStatus,
      documentStatus,
      revokedAt: documentRevokedAt,
    });

    // Step 7: Check token revocation (again, for safety)
    if (documentRevokedAt) {
      return new Response(
        JSON.stringify({ valid: false, status_label: "REVOKED" } as VerifyResponse),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Step 8: Return response based on validity
    if (!validityResult.isValid) {
      return new Response(
        JSON.stringify({ valid: false, status_label: "INVALID" } as VerifyResponse),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Valid document - return minimal public data
    const response: VerifyResponse = {
      valid: true,
      document_type: tokenData.document_type as "digital_card" | "diploma",
      holder_name: maskName(holderName),
      issuer_name: tenant.name,
      status_label: "VALID",
      issued_at: issuedAt,
      sport_type: tenant.sport_types?.[0] || undefined,
      grading_level: gradingLevel || undefined,
      valid_until: validUntil,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error verifying document:", error);
    // Always return neutral error for public endpoints
    return new Response(
      JSON.stringify({ valid: false, status_label: "NOT_FOUND" } as VerifyResponse),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  }
});
