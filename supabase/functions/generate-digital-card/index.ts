import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import { encode } from "https://deno.land/std@0.190.0/encoding/hex.ts";
import { qrcode } from "https://deno.land/x/qrcode@v2.0.0/mod.ts";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateCardRequest {
  membershipId: string;
}

// Generate QR code as base64 PNG data URL
async function generateQRCodeDataUrl(data: string): Promise<string> {
  const qrDataUrl = await qrcode(data, { size: 300 }) as unknown as string;
  return qrDataUrl;
}

// Calculate SHA-256 hash of canonical payload
async function calculateContentHash(payload: Record<string, unknown>): Promise<string> {
  const jsonStr = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonStr);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return new TextDecoder().decode(encode(hashArray));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // PI-D5.B: Parse and validate input
    let body: GenerateCardRequest;
    try {
      body = await req.json();
    } catch {
      // Neutral error - no stack trace
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const { membershipId } = body;

    // PI-D5.B: Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!membershipId || typeof membershipId !== "string" || !uuidRegex.test(membershipId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid membership ID" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Fetch membership with athlete and tenant data
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select(`
        *,
        athlete:athletes(*),
        tenant:tenants(*)
      `)
      .eq("id", membershipId)
      .maybeSingle();

    if (membershipError || !membership) {
      throw new Error(membershipError?.message || "Membership not found");
    }

    // Validate eligibility
    const eligibleStatuses = ["PENDING_REVIEW", "APPROVED", "ACTIVE"];
    if (membership.payment_status !== "PAID") {
      throw new Error("Membership payment not completed");
    }
    if (!eligibleStatuses.includes(membership.status)) {
      throw new Error(`Invalid membership status: ${membership.status}`);
    }

    // Check if card already exists
    const { data: existingCard } = await supabase
      .from("digital_cards")
      .select("id")
      .eq("membership_id", membershipId)
      .maybeSingle();

    if (existingCard) {
      return new Response(
        JSON.stringify({ success: true, message: "Card already exists", cardId: existingCard.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const athlete = membership.athlete;
    const tenant = membership.tenant;

    if (!athlete || !tenant) {
      throw new Error("Invalid membership data");
    }

    // Fetch coach name if preferred_coach_id exists
    let coachName: string | null = null;
    let coachId: string | null = null;
    if (membership.preferred_coach_id) {
      const { data: coach } = await supabase
        .from("coaches")
        .select("id, full_name")
        .eq("id", membership.preferred_coach_id)
        .maybeSingle();
      coachName = coach?.full_name || null;
      coachId = coach?.id || null;
    }

    // Fetch academy name if academy_id exists
    let academyName: string | null = null;
    let academyId: string | null = null;
    if (membership.academy_id) {
      const { data: academy } = await supabase
        .from("academies")
        .select("id, name")
        .eq("id", membership.academy_id)
        .maybeSingle();
      academyName = academy?.name || null;
      academyId = academy?.id || null;
    }

    // Get default sport type from tenant
    const defaultSportType = tenant.sport_types?.[0] || "Esporte de Combate";

    // Fetch athlete's current grading level
    let currentGrading: { levelName: string; levelCode: string; schemeName: string; sportType: string } | null = null;
    const { data: latestGrading } = await supabase
      .from("athlete_gradings")
      .select(`
        grading_level:grading_levels(
          display_name,
          code,
          grading_scheme:grading_schemes(name, sport_type)
        )
      `)
      .eq("athlete_id", athlete.id)
      .eq("tenant_id", tenant.id)
      .order("promotion_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestGrading?.grading_level) {
      const level = latestGrading.grading_level as any;
      currentGrading = {
        levelName: level.display_name,
        levelCode: level.code,
        schemeName: level.grading_scheme?.name || null,
        sportType: level.grading_scheme?.sport_type || defaultSportType,
      };
    }

    // Pre-generate card ID for QR code URL
    const cardId = crypto.randomUUID();
    const createdAtDate = new Date().toISOString().split('T')[0];

    // Helper to mask name for LGPD compliance
    const maskName = (name: string): string => {
      const parts = name.split(" ");
      if (parts.length > 1) {
        return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
      }
      return parts[0];
    };

    // Create STANDARDIZED canonical payload for SHA-256 hash
    // This payload structure is used for both QR data and hash verification
    const canonicalPayload = {
      // Athlete data (masked for privacy)
      atleta: {
        id: athlete.id,
        nome: athlete.full_name,
        nome_exibicao: maskName(athlete.full_name),
      },
      // Grading data (current level if available)
      graduacao: currentGrading ? {
        nivel: currentGrading.levelName,
        codigo: currentGrading.levelCode,
        sistema: currentGrading.schemeName,
        modalidade: currentGrading.sportType,
      } : null,
      // Date information
      data: {
        emissao: createdAtDate,
        validade: membership.end_date,
      },
      // Entity (tenant) information
      entidade: {
        id: tenant.id,
        nome: tenant.name,
        slug: tenant.slug,
        modalidade: currentGrading?.sportType || defaultSportType,
      },
      // Academy information
      academia: academyName ? {
        id: academyId,
        nome: academyName,
      } : null,
      // Responsible person (coach)
      responsavel: coachName ? { 
        id: coachId,
        nome: coachName,
        nome_exibicao: maskName(coachName),
      } : null,
      // Document metadata
      documento: {
        tipo: "CARTEIRINHA",
        id: cardId,
        membership_id: membership.id,
        status: membership.status,
      },
    };

    // Calculate content hash from canonical payload
    const contentHash = await calculateContentHash(canonicalPayload);
    console.log("Content hash calculated:", contentHash.substring(0, 12) + "...");

    // Generate QR code data with verification URL
    const verificationUrl = `https://tatame-pro.lovable.app/${tenant.slug}/verify/card/${cardId}`;
    const qrCodeData = verificationUrl;

    // Generate QR code as data URL
    const qrCodeDataUrl = await generateQRCodeDataUrl(qrCodeData);

    // Parse primary color or use default
    const primaryColor = tenant.primary_color || "#dc2626";
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 220, g: 38, b: 38 };
    };
    const rgb = hexToRgb(primaryColor);
    // sportType already defined above in canonicalPayload

    // Generate PDF
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [85.6, 140],
    });

    // Check if tenant has custom card template
    if (tenant.card_template_url) {
      try {
        const templateResponse = await fetch(tenant.card_template_url);
        if (templateResponse.ok) {
          const templateBlob = await templateResponse.blob();
          const templateBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(templateBlob);
          });
          const base64Data = templateBase64.split(',')[1];
          doc.addImage(base64Data, "PNG", 0, 0, 85.6, 140, undefined, "FAST");
        }
      } catch (e) {
        console.error("Failed to load card template:", e);
        doc.setFillColor(20, 20, 25);
        doc.rect(0, 0, 85.6, 140, "F");
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.rect(0, 0, 85.6, 8, "F");
      }
    } else {
      doc.setFillColor(20, 20, 25);
      doc.rect(0, 0, 85.6, 140, "F");
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.rect(0, 0, 85.6, 8, "F");
    }

    // Tenant name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    const tenantName = tenant.name.length > 25 ? tenant.name.substring(0, 22) + "..." : tenant.name;
    doc.text(tenantName, 42.8, 18, { align: "center" });

    // Sport type
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 180, 180);
    doc.text(currentGrading?.sportType || defaultSportType, 42.8, 24, { align: "center" });

    // Divider
    doc.setDrawColor(60, 60, 70);
    doc.line(10, 28, 75.6, 28);

    // Athlete name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    const athleteName = athlete.full_name.length > 22 ? athlete.full_name.substring(0, 19) + "..." : athlete.full_name;
    doc.text(athleteName, 42.8, 38, { align: "center" });

    // Status badge
    doc.setFillColor(34, 197, 94);
    doc.roundedRect(28, 42, 30, 6, 1, 1, "F");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text("ATLETA FILIADO", 42.8, 46.5, { align: "center" });

    // QR Code
    const qrImage = qrCodeDataUrl.split(",")[1];
    doc.addImage(qrImage, "PNG", 22.8, 52, 40, 40, undefined, "FAST");

    // Validity info
    doc.setTextColor(180, 180, 180);
    doc.setFontSize(8);
    doc.text("Válido até", 42.8, 100, { align: "center" });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    const endDate = membership.end_date 
      ? new Date(membership.end_date).toLocaleDateString("pt-BR")
      : "-";
    doc.text(endDate, 42.8, 106, { align: "center" });

    // Membership ID
    doc.setTextColor(120, 120, 130);
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text(`ID: ${membership.id.substring(0, 8).toUpperCase()}`, 42.8, 115, { align: "center" });

    // Footer with hash
    doc.setFillColor(30, 30, 35);
    doc.rect(0, 122, 85.6, 18, "F");
    doc.setTextColor(100, 100, 110);
    doc.setFontSize(5);
    doc.text("Escaneie o QR code para verificar autenticidade", 42.8, 128, { align: "center" });
    doc.setFontSize(4);
    doc.text(`SHA-256: ${contentHash.substring(0, 16)}...`, 42.8, 134, { align: "center" });

    // Get PDF as array buffer
    const pdfArrayBuffer = doc.output("arraybuffer");
    const pdfBlob = new Blob([pdfArrayBuffer], { type: "application/pdf" });

    // Upload QR code image
    const qrFileName = `${tenant.id}/${membership.id}/qr_code.png`;
    const qrBlob = await (await fetch(qrCodeDataUrl)).blob();
    
    const { error: qrUploadError } = await supabase.storage
      .from("cards")
      .upload(qrFileName, qrBlob, { contentType: "image/png", upsert: true });

    if (qrUploadError) {
      console.error("QR upload error:", qrUploadError);
    }

    const { data: qrUrl } = supabase.storage.from("cards").getPublicUrl(qrFileName);

    // Upload PDF
    const pdfFileName = `${tenant.id}/${membership.id}/card.pdf`;
    
    const { error: pdfUploadError } = await supabase.storage
      .from("cards")
      .upload(pdfFileName, pdfBlob, { contentType: "application/pdf", upsert: true });

    if (pdfUploadError) {
      console.error("PDF upload error:", pdfUploadError);
    }

    const { data: pdfUrl } = supabase.storage.from("cards").getPublicUrl(pdfFileName);

    // Create digital_card record with content hash (using pre-generated ID)
    const { data: digitalCard, error: cardError } = await supabase
      .from("digital_cards")
      .insert({
        id: cardId,
        tenant_id: tenant.id,
        membership_id: membership.id,
        qr_code_data: qrCodeData,
        qr_code_image_url: qrUrl.publicUrl,
        pdf_url: pdfUrl.publicUrl,
        valid_until: membership.end_date,
        content_hash_sha256: contentHash,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (cardError) {
      throw new Error(`Failed to create digital card: ${cardError.message}`);
    }

    // PI-D3-DOCS1.0: Generate public verification token for the card
    let publicToken: string | null = null;
    try {
      const { data: tokenResult, error: tokenError } = await supabase.rpc(
        "generate_document_token",
        {
          p_document_type: "digital_card",
          p_document_id: digitalCard.id,
          p_tenant_id: tenant.id,
        }
      );
      
      if (tokenError) {
        console.error("Failed to generate public token:", tokenError);
      } else {
        publicToken = tokenResult;
        console.log("Generated public token for card:", digitalCard.id);
      }
    } catch (tokenGenError) {
      // Non-fatal: token generation failure shouldn't fail card creation
      console.error("Token generation error (non-fatal):", tokenGenError);
    }

    // PI-D4-AUDIT1.0: Log DOCUMENT_ISSUED event
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.DOCUMENT_ISSUED,
      tenant_id: tenant.id,
      profile_id: null, // System-generated
      metadata: {
        document_type: 'digital_card',
        athlete_id: athlete.id,
        membership_id: membership.id,
        automatic: false,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        digitalCard: {
          id: digitalCard.id,
          qrCodeUrl: qrUrl.publicUrl,
          pdfUrl: pdfUrl.publicUrl,
          contentHash: contentHash,
          publicToken: publicToken,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    // PI-D5.B: Neutral error - no stack trace, no semantic info
    console.error("Error generating digital card:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Card generation failed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
