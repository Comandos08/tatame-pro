/**
 * publish-event-bracket — P2.4 Bracket Publication
 * 
 * Transitions a bracket from DRAFT to PUBLISHED status.
 * Once published, the bracket becomes immutable (enforced by DB trigger).
 * 
 * SECURITY:
 * - Requires ADMIN_TENANT or SUPERADMIN role
 * - Validates impersonation for superadmin
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireTenantRole } from "../_shared/requireTenantRole.ts";
import { assertTenantAccess, TenantBoundaryError } from "../_shared/tenant-boundary.ts";
import { requireImpersonationIfSuperadmin, extractImpersonationId } from "../_shared/requireImpersonationIfSuperadmin.ts";
import { requireActiveTenantBillingWrite } from "../_shared/requireActiveTenantBillingWrite.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";


interface PublishBracketRequest {
  bracketId: string;
  impersonationId?: string;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("publish-event-bracket", correlationId);

  try {
    // 1️⃣ Parse request
    const body: PublishBracketRequest = await req.json();
    const { bracketId } = body;
    const impersonationId = extractImpersonationId(req, body);

    log.info("Request", { bracketId, hasImpersonation: !!impersonationId });

    if (!bracketId) {
      return new Response(
        JSON.stringify({ error: 'bracketId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2️⃣ Create clients
    // PI-SAFE-GOLD-GATE-TRACE-001 — FAIL-FAST ENV VALIDATION (P0)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // PI-AUTH-CLIENT-SPLIT-001: supabaseAdmin for DB ops, supabaseAuth for JWT validation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      log.error("Auth error", authError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3️⃣ Get bracket
    const { data: bracket, error: bracketError } = await supabaseAdmin
      .from('event_brackets')
      .select('id, tenant_id, status, version, deleted_at')
      .eq('id', bracketId)
      .maybeSingle();

    if (bracketError || !bracket) {
      log.error("Bracket not found", bracketError);
      return new Response(
        JSON.stringify({ error: 'Bracket not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (bracket.deleted_at) {
      return new Response(
        JSON.stringify({ error: 'Cannot publish deleted bracket' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (bracket.status === 'PUBLISHED') {
      return new Response(
        JSON.stringify({ error: 'Bracket is already published' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = bracket.tenant_id;

    // A04 — Tenant Boundary Check (Zero-Trust)
    try {
      await assertTenantAccess(supabaseAdmin, user.id, tenantId, impersonationId);
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

    // 4️⃣ P3.4 + P3.5: Check tenant ACTIVE + billing allows writes (with audit)
    const billingGate = await requireActiveTenantBillingWrite({
      supabase: supabaseAdmin,
      tenantId,
      userId: user.id,
      domain: 'EVENTS',
      operation: 'publish_event_bracket',
    });
    if (!billingGate.ok) {
      log.warn("Billing gate failed", { code: billingGate.code });
      return new Response(
        JSON.stringify({ ok: false, code: billingGate.code, error: billingGate.error }),
        { status: billingGate.httpStatus ?? 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5️⃣ Check role
    const roleCheck = await requireTenantRole(
      supabaseAdmin, 
      req.headers.get('Authorization'), 
      tenantId, 
      ['ADMIN_TENANT']
    );
    if (!roleCheck.allowed) {
      log.warn("Role check failed", { error: roleCheck.error });
      return new Response(
        JSON.stringify({ error: roleCheck.error }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6️⃣ Check impersonation if superadmin
    const impersonationCheck = await requireImpersonationIfSuperadmin(
      supabaseAdmin,
      user.id,
      tenantId,
      impersonationId
    );

    if (!impersonationCheck.valid) {
      log.warn("Impersonation check failed", { error: impersonationCheck.error });
      return new Response(
        JSON.stringify({ error: impersonationCheck.error }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6️⃣ Publish bracket
    const { error: updateError } = await supabaseAdmin
      .from('event_brackets')
      .update({
        status: 'PUBLISHED',
        published_at: new Date().toISOString(),
      })
      .eq('id', bracketId);

    if (updateError) {
      log.error("Update error", updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to publish bracket' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    log.info("Success! Bracket published", { bracketId, version: bracket.version });

    return new Response(
      JSON.stringify({
        success: true,
        bracketId: bracketId,
        version: bracket.version,
        status: 'PUBLISHED',
        publishedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    log.error("Unexpected error", err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
