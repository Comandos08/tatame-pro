import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import QRCode from "https://esm.sh/qrcode@1.5.3";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateCardRequest {
  membershipId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { membershipId }: GenerateCardRequest = await req.json();

    if (!membershipId) {
      throw new Error("Missing membershipId");
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

    // Generate QR code data
    const qrPayload = {
      tenantSlug: tenant.slug,
      membershipId: membership.id,
      athleteId: athlete.id,
      validUntil: membership.end_date,
    };
    const qrCodeData = JSON.stringify(qrPayload);

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeData, {
      width: 300,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    // Generate PDF
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [85.6, 140], // Credit card ratio but taller
    });

    // Background
    doc.setFillColor(20, 20, 25);
    doc.rect(0, 0, 85.6, 140, "F");

    // Header accent
    doc.setFillColor(220, 38, 38); // Primary red
    doc.rect(0, 0, 85.6, 8, "F");

    // Tenant name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    const tenantName = tenant.name.length > 25 ? tenant.name.substring(0, 22) + "..." : tenant.name;
    doc.text(tenantName, 42.8, 18, { align: "center" });

    // Sport type
    const sportType = tenant.sport_types?.[0] || "Esporte de Combate";
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 180, 180);
    doc.text(sportType, 42.8, 24, { align: "center" });

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
    doc.setFillColor(34, 197, 94); // Green for valid
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

    // Footer
    doc.setFillColor(30, 30, 35);
    doc.rect(0, 125, 85.6, 15, "F");
    doc.setTextColor(100, 100, 110);
    doc.setFontSize(6);
    doc.text("Escaneie o QR code para verificar autenticidade", 42.8, 132, { align: "center" });

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

    // Create digital_card record
    const { data: digitalCard, error: cardError } = await supabase
      .from("digital_cards")
      .insert({
        tenant_id: tenant.id,
        membership_id: membership.id,
        qr_code_data: qrCodeData,
        qr_code_image_url: qrUrl.publicUrl,
        pdf_url: pdfUrl.publicUrl,
        valid_until: membership.end_date,
      })
      .select()
      .single();

    if (cardError) {
      throw new Error(`Failed to create digital card: ${cardError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        digitalCard: {
          id: digitalCard.id,
          qrCodeUrl: qrUrl.publicUrl,
          pdfUrl: pdfUrl.publicUrl,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error generating digital card:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
