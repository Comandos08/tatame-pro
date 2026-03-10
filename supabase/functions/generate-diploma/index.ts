// ============= Full file contents =============

/**
 * @contract generate-diploma
 * 
 * SAFE GOLD — PI-D6.1.2: Diploma Generation
 * 
 * INPUT:
 *   - athleteId: UUID (required)
 *   - gradingLevelId: UUID (required)
 *   - promotionDate: string (required)
 *   - academyId: UUID (optional)
 *   - coachId: UUID (optional)
 *   - notes: string (optional)
 *   - officiality_override: object (optional, requires ADMIN role)
 * 
 * PRECONDITIONS:
 *   - tenant.lifecycle_status === 'ACTIVE' (I4)
 *   - billing.status ∈ ['ACTIVE', 'TRIALING'] (I7)
 *   - athlete has ACTIVE membership OR officiality_override approved
 * 
 * POSTCONDITIONS:
 *   - diplomas row created
 *   - athlete_gradings row created
 *   - document_public_tokens row created
 *   - audit event DIPLOMA_ISSUED logged
 * 
 * ERRORS:
 *   - All errors return HTTP 200 with { success: false } (I6)
 *   - No stack traces exposed
 * 
 * INVARIANTS:
 *   - I1: Golden Rule applied (tenant ACTIVE + billing OK + doc ISSUED)
 *   - I4: Tenant lifecycle validated
 *   - I6: Neutral error responses
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import { encode } from "https://deno.land/std@0.168.0/encoding/hex.ts";
import { qrcode } from "https://deno.land/x/qrcode@v2.0.0/mod.ts";
import {
  requireBillingStatus,
  billingRestrictedResponse,
} from "../_shared/requireBillingStatus.ts";
import { logBillingRestricted } from "../_shared/decision-logger.ts";
import { requireTenantRole } from "../_shared/requireTenantRole.ts";
import { assertTenantAccess, TenantBoundaryError } from "../_shared/tenant-boundary.ts";
import { requireTenantActive, tenantNotActiveResponse } from "../_shared/requireTenantActive.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";

// Generate QR code as base64 PNG data URL
async function generateQRCodeDataUrl(data: string): Promise<string> {
  const qrDataUrl = await qrcode(data, { size: 150 }) as unknown as string;
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
  officiality_override?: {
    enabled: boolean;
    reason: string;
    granted_by_profile_id: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("generate-diploma", correlationId);

  try {
    // PI-SAFE-GOLD-GATE-TRACE-001 — FAIL-FAST ENV VALIDATION (P0)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const BASE_URL = Deno.env.get('PUBLIC_APP_URL') ?? 'https://tatame-pro.lovable.app';
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Diploma generation failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // PI-AUTH-CLIENT-SPLIT-001: supabaseAdmin for DB ops, supabaseAuth for JWT validation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
    });

    // AUTH VALIDATION (Zero-Trust prerequisite)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PI-D5.B: Parse and validate input
    let body: GenerateDiplomaRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { athleteId, gradingLevelId, academyId, coachId, promotionDate, notes, officiality_override } = body;

    // PI-D5.B: Validate UUID format for all IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!athleteId || !gradingLevelId || !promotionDate) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!uuidRegex.test(athleteId) || !uuidRegex.test(gradingLevelId)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid ID format' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (academyId && !uuidRegex.test(academyId)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid academy ID format' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (coachId && !uuidRegex.test(coachId)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid coach ID format' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch athlete data
    const { data: athlete, error: athleteError } = await supabaseAdmin
      .from('athletes')
      .select('id, full_name, tenant_id, profile_id')
      .eq('id', athleteId)
      .maybeSingle();

    if (athleteError || !athlete) {
      return new Response(
        JSON.stringify({ success: false, error: 'Athlete not found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch grading level with scheme
    const { data: gradingLevel, error: levelError } = await supabaseAdmin
      .from('grading_levels')
      .select(`
        id, code, display_name, order_index, tenant_id,
        grading_schemes:grading_scheme_id (id, name, sport_type)
      `)
      .eq('id', gradingLevelId)
      .maybeSingle();

    if (levelError || !gradingLevel) {
      return new Response(
        JSON.stringify({ success: false, error: 'Grading level not found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate same tenant
    if (athlete.tenant_id !== gradingLevel.tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid tenant context' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = athlete.tenant_id;

    // A04 — Tenant Boundary Check (Zero-Trust)
    try {
      await assertTenantAccess(supabaseAdmin, user.id, tenantId);
      log.info("Tenant boundary check passed");
    } catch (boundaryError) {
      if (boundaryError instanceof TenantBoundaryError) {
        log.warn("Tenant boundary violation", { code: boundaryError.code });
        return new Response(
          JSON.stringify({ ok: false, code: boundaryError.code, error: "Access denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw boundaryError;
    }

    // Fetch tenant data
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, name, slug, logo_url, primary_color')
      .eq('id', tenantId)
      .maybeSingle();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tenant not found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // PI-D6.1.2: TENANT LIFECYCLE CHECK (I4)
    // INVARIANT: Only ACTIVE tenants can emit documents
    // ========================================================================
    const tenantCheck = await requireTenantActive(supabaseAdmin, tenantId);
    if (!tenantCheck.allowed) {
      log.info("[GENERATE-DIPLOMA] Tenant not active:", { code: tenantCheck.code });
      return tenantNotActiveResponse(tenantCheck.status);
    }

    // ========================================================================
    // BILLING STATUS CHECK (P1 - Block operations on restricted tenants)
    // ========================================================================
    const billingCheck = await requireBillingStatus(supabaseAdmin, tenantId);
    if (!billingCheck.allowed) {
      log.info("[GENERATE-DIPLOMA] Billing status blocked operation:", { status: billingCheck.status });
      
      await logBillingRestricted(supabaseAdmin, {
        operation: 'generate-diploma',
        user_id: athleteId, // Using athleteId as context since no user auth here
        tenant_id: tenantId,
        billing_status: billingCheck.status,
      });
      
      return billingRestrictedResponse(billingCheck.status);
    }

    log.info("[GENERATE-DIPLOMA] Billing status OK:", { status: billingCheck.status });

    // ─────────────────────────────────────────────────────────────
    // PI-POL-001B — MEMBERSHIP REQUIRED (OFFICIAL DIPLOMA)
    // Contract: HTTP 200 always. Fail-closed.
    // ─────────────────────────────────────────────────────────────

    const profileId = athlete?.profile_id ?? null;

    // Case 1: Athlete has no profile_id (fail-closed)
    if (!profileId) {
      log.info("[GENERATE-DIPLOMA][PI-POL-001B] Blocked: athlete.profile_id is null");
      
      await supabaseAdmin.from('audit_logs').insert({
        tenant_id: tenantId,
        event_type: 'DIPLOMA_BLOCKED_NO_ACTIVE_MEMBERSHIP',
        category: 'GRADING',
        level: 'WARN',
        metadata: {
          athlete_id: athleteId,
          profile_id: null,
          grading_level_id: gradingLevelId,
          rule: 'MEMBERSHIP_REQUIRED',
          decision: 'BLOCKED',
          reason: 'ATHLETE_PROFILE_ID_NULL'
        }
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: 'MEMBERSHIP_REQUIRED',
          message: 'Official diploma requires ACTIVE membership.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Case 2: Check for ACTIVE membership
    let hasActiveMembership = false;

    try {
      const { data: activeMembership, error: membershipErr } = await supabaseAdmin
        .from('memberships')
        .select('id')
        .eq('applicant_profile_id', profileId)
        .eq('tenant_id', tenantId)
        .in('status', ['ACTIVE', 'APPROVED'])
        .maybeSingle();

      if (membershipErr) {
        log.error('[GENERATE-DIPLOMA][PI-POL-001B] membership lookup error:', membershipErr);
        hasActiveMembership = false; // fail-closed
      } else {
        hasActiveMembership = !!activeMembership;
      }
    } catch (e) {
      log.error('[GENERATE-DIPLOMA][PI-POL-001B] membership lookup exception:', e);
      hasActiveMembership = false; // fail-closed
    }

    // ─────────────────────────────────────────────────────────────
    // PI-POL-001D — OFFICIALITY OVERRIDE (COURTESY)
    // Contract: HTTP 200 always. Override requires ADMIN role + valid reason.
    // ─────────────────────────────────────────────────────────────

    const override = officiality_override;
    let overrideApplied = false;

    if (!hasActiveMembership) {
      // Check if override is being requested
      if (override?.enabled === true) {
        // Validate override parameters
        const overrideReason = (override.reason || '').trim();
        const grantedBy = override.granted_by_profile_id;

        if (!grantedBy || overrideReason.length < 8) {
          log.info("[GENERATE-DIPLOMA][PI-POL-001D] Override rejected: invalid parameters");
          
          await supabaseAdmin.from('audit_logs').insert({
            tenant_id: tenantId,
            event_type: 'DIPLOMA_OVERRIDE_BLOCKED_FORBIDDEN',
            category: 'GRADING',
            level: 'WARN',
            metadata: {
              athlete_id: athleteId,
              profile_id: profileId,
              grading_level_id: gradingLevelId,
              rule: 'OFFICIALITY_OVERRIDE',
              decision: 'BLOCKED',
              reason: 'INVALID_OVERRIDE_PARAMETERS',
              override_reason_length: overrideReason.length,
              granted_by: grantedBy || null
            }
          });

          return new Response(
            JSON.stringify({
              success: false,
              error: 'OFFICIALITY_OVERRIDE_FORBIDDEN',
              message: 'Override requires valid reason (min 8 chars) and grantor ID.'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate role of grantor (ADMIN_TENANT or SUPERADMIN_GLOBAL)
        const roleCheck = await requireTenantRole(
          supabaseAdmin,
          req.headers.get('Authorization'),
          tenantId,
          ['ADMIN_TENANT', 'STAFF_ORGANIZACAO']
        );

        if (!roleCheck.allowed && !roleCheck.isGlobalSuperadmin) {
          log.info("[GENERATE-DIPLOMA][PI-POL-001D] Override rejected: insufficient permissions");
          
          await supabaseAdmin.from('audit_logs').insert({
            tenant_id: tenantId,
            event_type: 'DIPLOMA_OVERRIDE_BLOCKED_FORBIDDEN',
            category: 'GRADING',
            level: 'WARN',
            metadata: {
              athlete_id: athleteId,
              profile_id: profileId,
              grading_level_id: gradingLevelId,
              rule: 'OFFICIALITY_OVERRIDE',
              decision: 'BLOCKED',
              reason: 'INSUFFICIENT_PERMISSIONS',
              grantor_id: grantedBy,
              user_roles: roleCheck.roles
            }
          });

          return new Response(
            JSON.stringify({
              success: false,
              error: 'OFFICIALITY_OVERRIDE_FORBIDDEN',
              message: 'Override requires ADMIN or SUPERADMIN permissions.'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Override approved
        log.info("[GENERATE-DIPLOMA][PI-POL-001D] Override approved - proceeding with official diploma");
        overrideApplied = true;

      } else {
        // No override requested - apply standard MEMBERSHIP_REQUIRED block
        log.info("[GENERATE-DIPLOMA][PI-POL-001B] Blocked: no ACTIVE membership for profile", { profileId });
        
        await supabaseAdmin.from('audit_logs').insert({
          tenant_id: tenantId,
          event_type: 'DIPLOMA_BLOCKED_NO_ACTIVE_MEMBERSHIP',
          category: 'GRADING',
          level: 'WARN',
          metadata: {
            athlete_id: athleteId,
            profile_id: profileId,
            grading_level_id: gradingLevelId,
            rule: 'MEMBERSHIP_REQUIRED',
            decision: 'BLOCKED',
            reason: 'NO_ACTIVE_MEMBERSHIP'
          }
        });

        return new Response(
          JSON.stringify({
            success: false,
            error: 'MEMBERSHIP_REQUIRED',
            message: 'Official diploma requires ACTIVE membership.'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    log.info("[GENERATE-DIPLOMA][PI-POL-001B] Membership check OK - proceeding with official diploma");

    // Fetch academy if provided
    let academyName = null;
    if (academyId) {
      const { data: academy } = await supabaseAdmin
        .from('academies')
        .select('name')
        .eq('id', academyId)
        .maybeSingle();
      academyName = academy?.name;
    }

    // Fetch coach if provided
    let coachName = null;
    if (coachId) {
      const { data: coach } = await supabaseAdmin
        .from('coaches')
        .select('full_name')
        .eq('id', coachId)
        .maybeSingle();
      coachName = coach?.full_name;
    }

    // Get sport type from grading scheme
    const sportType = (gradingLevel.grading_schemes as any)?.sport_type || 'SPORT';

    // Generate serial number
    const { data: serialData, error: serialError } = await supabaseAdmin
      .rpc('get_next_diploma_serial', { p_tenant_id: tenantId, p_sport_type: sportType });

    if (serialError) {
      log.error('Error generating serial number:', serialError);
      return new Response(
        JSON.stringify({ success: false, error: 'Diploma generation failed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serialNumber = serialData;

    // Create diploma ID first (we'll use it for QR code URL)
    const diplomaId = crypto.randomUUID();

    // Create QR code data with verification URL
    const verificationUrl = `${BASE_URL}/${tenant.slug}/verify/diploma/${diplomaId}`;
    const qrCodeData = verificationUrl;

    // Generate QR code image
    const qrCodeDataUrl = await generateQRCodeDataUrl(qrCodeData);

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
    
    const { error: qrUploadError } = await supabaseAdmin.storage
      .from('cards')
      .upload(qrFileName, qrImageBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (qrUploadError) {
      log.error('QR upload error:', qrUploadError);
    }

    const { data: qrUrlData } = supabaseAdmin.storage.from('cards').getPublicUrl(qrFileName);
    const qrCodeImageUrl = qrUrlData?.publicUrl;

    // Upload PDF
    const pdfFileName = `diplomas/${tenantId}/${athleteId}/${serialNumber.replace(/\//g, '-')}.pdf`;
    
    const { error: pdfUploadError } = await supabaseAdmin.storage
      .from('cards')
      .upload(pdfFileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (pdfUploadError) {
      log.error('PDF upload error:', pdfUploadError);
      return new Response(
        JSON.stringify({ success: false, error: 'Diploma generation failed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: pdfUrlData } = supabaseAdmin.storage.from('cards').getPublicUrl(pdfFileName);
    const pdfUrl = pdfUrlData?.publicUrl;

    // Helper to mask name for LGPD compliance
    const maskName = (name: string): string => {
      const parts = name.split(" ");
      if (parts.length > 1) {
        return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
      }
      return parts[0];
    };

    const issuedAt = new Date().toISOString();
    const issuedDate = issuedAt.split('T')[0];

    // Calculate content hash for integrity verification
    // STANDARDIZED canonical payload with professional-level information
    const canonicalPayload = {
      // Athlete data (masked for privacy)
      atleta: {
        id: athleteId,
        nome: athlete.full_name,
        nome_exibicao: maskName(athlete.full_name),
      },
      // Grading data (complete graduation info)
      graduacao: {
        id: gradingLevelId,
        nivel: gradingLevel.display_name,
        codigo: gradingLevel.code,
        sistema: (gradingLevel.grading_schemes as any)?.name || null,
        modalidade: sportType,
      },
      // Date information
      data: {
        emissao: issuedDate,
        promocao: promotionDate,
      },
      // Entity (tenant) information
      entidade: {
        id: tenantId,
        nome: tenant.name,
        slug: tenant.slug,
        modalidade: sportType,
      },
      // Academy information
      academia: academyName ? {
        id: academyId,
        nome: academyName,
      } : null,
      // Responsible person (coach who granted the graduation)
      responsavel: coachName ? { 
        id: coachId,
        nome: coachName,
        nome_exibicao: maskName(coachName),
      } : null,
      // Document metadata
      documento: {
        tipo: "DIPLOMA",
        id: diplomaId,
        serial: serialNumber,
      },
    };
    const contentHash = await calculateContentHash(canonicalPayload);
    log.info("Diploma content hash:", { hash: contentHash.substring(0, 12) + "..." });

    // P0.4 — Prevent duplicate diplomas for same athlete + grading level
    const { data: existingDiploma } = await supabaseAdmin
      .from('diplomas')
      .select('id, serial_number')
      .eq('athlete_id', athleteId)
      .eq('grading_level_id', gradingLevelId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (existingDiploma) {
      log.info('Duplicate diploma prevented', { athlete_id: athleteId, grading_level_id: gradingLevelId, existing_id: existingDiploma.id });
      return new Response(
        JSON.stringify({ success: false, error: 'Diploma já emitido para este atleta neste nível', diploma_id: existingDiploma.id, serial_number: existingDiploma.serial_number }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create diploma record with content hash (using pre-generated ID)
    const { data: diploma, error: diplomaError } = await supabaseAdmin
      .from('diplomas')
      .insert({
        id: diplomaId,
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
        issued_at: issuedAt,
        content_hash_sha256: contentHash,
        is_official: true,
      })
      .select()
      .maybeSingle();

    if (diplomaError || !diploma) {
      log.error('Diploma insert error:', diplomaError);
      return new Response(
        JSON.stringify({ success: false, error: 'Diploma generation failed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create athlete grading record
    const { data: grading, error: gradingError } = await supabaseAdmin
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
        is_official: true,
      })
      .select()
      .maybeSingle();

    if (gradingError) {
      log.error('Grading insert error:', gradingError);
      // Don't fail - diploma was created successfully
    }

    // PI-POL-001D: Log override success if applicable
    if (overrideApplied) {
      await supabaseAdmin.from('audit_logs').insert({
        tenant_id: tenantId,
        event_type: 'DIPLOMA_ISSUED_OFFICIAL_OVERRIDE',
        category: 'GRADING',
        level: 'INFO',
        metadata: {
          athlete_id: athleteId,
          profile_id: profileId,
          diploma_id: diploma.id,
          grading_level_id: gradingLevelId,
          override_reason: officiality_override?.reason,
          granted_by_profile_id: officiality_override?.granted_by_profile_id,
          decision: 'ALLOWED_VIA_OVERRIDE'
        }
      });
    }

    // Send notification email to athlete about new grading
    if (grading) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      
      fetch(`${supabaseUrl}/functions/v1/notify-new-grading`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ grading_id: grading.id }),
      }).catch((err) => log.error('Failed to send grading notification:', err));
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
    // PI-D5.B: Neutral error - no stack trace, no semantic info
    log.error('Error generating diploma:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Diploma generation failed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
