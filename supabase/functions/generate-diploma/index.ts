import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import QRCode from "https://esm.sh/qrcode@1.5.3";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateDiplomaRequest {
  athleteId: string;
  gradingLevelId: string;
  academyId?: string;
  coachId?: string;
  promotionDate: string;
  notes?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { athleteId, gradingLevelId, academyId, coachId, promotionDate, notes }: GenerateDiplomaRequest = await req.json();

    if (!athleteId || !gradingLevelId || !promotionDate) {
      return new Response(
        JSON.stringify({ error: 'athleteId, gradingLevelId, and promotionDate are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch athlete data
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('id, full_name, tenant_id')
      .eq('id', athleteId)
      .single();

    if (athleteError || !athlete) {
      return new Response(
        JSON.stringify({ error: 'Athlete not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch grading level with scheme
    const { data: gradingLevel, error: levelError } = await supabase
      .from('grading_levels')
      .select(`
        id, code, display_name, order_index, tenant_id,
        grading_schemes:grading_scheme_id (id, name, sport_type)
      `)
      .eq('id', gradingLevelId)
      .single();

    if (levelError || !gradingLevel) {
      return new Response(
        JSON.stringify({ error: 'Grading level not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate same tenant
    if (athlete.tenant_id !== gradingLevel.tenant_id) {
      return new Response(
        JSON.stringify({ error: 'Athlete and grading level must belong to the same tenant' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = athlete.tenant_id;

    // Fetch tenant data
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name, slug, logo_url, primary_color')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: 'Tenant not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch academy if provided
    let academyName = null;
    if (academyId) {
      const { data: academy } = await supabase
        .from('academies')
        .select('name')
        .eq('id', academyId)
        .single();
      academyName = academy?.name;
    }

    // Fetch coach if provided
    let coachName = null;
    if (coachId) {
      const { data: coach } = await supabase
        .from('coaches')
        .select('full_name')
        .eq('id', coachId)
        .single();
      coachName = coach?.full_name;
    }

    // Get sport type from grading scheme
    const sportType = (gradingLevel.grading_schemes as any)?.sport_type || 'SPORT';

    // Generate serial number
    const { data: serialData, error: serialError } = await supabase
      .rpc('get_next_diploma_serial', { p_tenant_id: tenantId, p_sport_type: sportType });

    if (serialError) {
      console.error('Error generating serial number:', serialError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate serial number' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serialNumber = serialData;

    // Create QR code data
    const qrCodeData = JSON.stringify({
      type: 'diploma',
      tenantSlug: tenant.slug,
      athleteId,
      gradingLevelId,
      promotionDate,
      serialNumber,
      issuedAt: new Date().toISOString(),
    });

    // Generate QR code image
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeData, {
      width: 150,
      margin: 1,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    });

    // Create PDF diploma (landscape A4)
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = 297;
    const pageHeight = 210;

    // Dark background
    doc.setFillColor(26, 26, 26);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Border
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(2);
    doc.rect(10, 10, pageWidth - 20, pageHeight - 20);

    // Inner border
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.5);
    doc.rect(15, 15, pageWidth - 30, pageHeight - 30);

    // Title
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(36);
    doc.setFont('helvetica', 'bold');
    doc.text('DIPLOMA DE GRADUAÇÃO', pageWidth / 2, 45, { align: 'center' });

    // Organization name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'normal');
    doc.text(tenant.name.toUpperCase(), pageWidth / 2, 58, { align: 'center' });

    // Certifies text
    doc.setFontSize(14);
    doc.setTextColor(180, 180, 180);
    doc.text('Certifica que', pageWidth / 2, 75, { align: 'center' });

    // Athlete name
    doc.setFontSize(28);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text(athlete.full_name.toUpperCase(), pageWidth / 2, 90, { align: 'center' });

    // Grading text
    doc.setFontSize(14);
    doc.setTextColor(180, 180, 180);
    doc.setFont('helvetica', 'normal');
    doc.text('foi promovido(a) ao grau de', pageWidth / 2, 105, { align: 'center' });

    // Grading level
    doc.setFontSize(24);
    doc.setTextColor(220, 38, 38);
    doc.setFont('helvetica', 'bold');
    doc.text(gradingLevel.display_name.toUpperCase(), pageWidth / 2, 120, { align: 'center' });

    // Sport and scheme
    doc.setFontSize(12);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    const schemeName = (gradingLevel.grading_schemes as any)?.name || '';
    doc.text(`${sportType} - ${schemeName}`, pageWidth / 2, 132, { align: 'center' });

    // Academy and Coach
    let detailsY = 145;
    if (academyName) {
      doc.setFontSize(11);
      doc.setTextColor(200, 200, 200);
      doc.text(`Academia: ${academyName}`, pageWidth / 2, detailsY, { align: 'center' });
      detailsY += 8;
    }
    if (coachName) {
      doc.setFontSize(11);
      doc.setTextColor(200, 200, 200);
      doc.text(`Graduado por: ${coachName}`, pageWidth / 2, detailsY, { align: 'center' });
    }

    // Date
    const formattedDate = new Date(promotionDate).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    doc.setFontSize(12);
    doc.setTextColor(180, 180, 180);
    doc.text(formattedDate, pageWidth / 2, 170, { align: 'center' });

    // Serial number
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(`Nº ${serialNumber}`, 25, 195);

    // QR Code
    const qrImage = qrCodeDataUrl.split(',')[1];
    doc.addImage(qrImage, 'PNG', pageWidth - 50, 160, 30, 30);

    // Get PDF as base64
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    const pdfBuffer = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));

    // Upload QR code image
    const qrImageBuffer = Uint8Array.from(atob(qrCodeDataUrl.split(',')[1]), c => c.charCodeAt(0));
    const qrFileName = `diplomas/${tenantId}/${athleteId}/${serialNumber.replace(/\//g, '-')}_qr.png`;
    
    const { error: qrUploadError } = await supabase.storage
      .from('cards')
      .upload(qrFileName, qrImageBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (qrUploadError) {
      console.error('QR upload error:', qrUploadError);
    }

    const { data: qrUrlData } = supabase.storage.from('cards').getPublicUrl(qrFileName);
    const qrCodeImageUrl = qrUrlData?.publicUrl;

    // Upload PDF
    const pdfFileName = `diplomas/${tenantId}/${athleteId}/${serialNumber.replace(/\//g, '-')}.pdf`;
    
    const { error: pdfUploadError } = await supabase.storage
      .from('cards')
      .upload(pdfFileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (pdfUploadError) {
      console.error('PDF upload error:', pdfUploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload PDF' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: pdfUrlData } = supabase.storage.from('cards').getPublicUrl(pdfFileName);
    const pdfUrl = pdfUrlData?.publicUrl;

    // Create diploma record
    const { data: diploma, error: diplomaError } = await supabase
      .from('diplomas')
      .insert({
        tenant_id: tenantId,
        athlete_id: athleteId,
        grading_level_id: gradingLevelId,
        academy_id: academyId || null,
        coach_id: coachId || null,
        promotion_date: promotionDate,
        serial_number: serialNumber,
        pdf_url: pdfUrl,
        qr_code_data: qrCodeData,
        qr_code_image_url: qrCodeImageUrl,
        status: 'ISSUED',
        issued_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (diplomaError) {
      console.error('Diploma insert error:', diplomaError);
      return new Response(
        JSON.stringify({ error: 'Failed to create diploma record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create athlete grading record
    const { data: grading, error: gradingError } = await supabase
      .from('athlete_gradings')
      .insert({
        tenant_id: tenantId,
        athlete_id: athleteId,
        grading_level_id: gradingLevelId,
        academy_id: academyId || null,
        coach_id: coachId || null,
        promotion_date: promotionDate,
        notes: notes || null,
        diploma_id: diploma.id,
      })
      .select()
      .single();

    if (gradingError) {
      console.error('Grading insert error:', gradingError);
      // Don't fail - diploma was created successfully
    }

    return new Response(
      JSON.stringify({
        success: true,
        diploma: {
          id: diploma.id,
          serialNumber,
          pdfUrl,
          qrCodeImageUrl,
        },
        grading: grading || null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error generating diploma:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
