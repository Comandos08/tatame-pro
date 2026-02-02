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
import { requireImpersonationIfSuperadmin, extractImpersonationId } from "../_shared/requireImpersonationIfSuperadmin.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-impersonation-id',
};

interface PublishBracketRequest {
  bracketId: string;
  impersonationId?: string;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1️⃣ Parse request
    const body: PublishBracketRequest = await req.json();
    const { bracketId } = body;
    const impersonationId = extractImpersonationId(req, body);

    console.log('[PUBLISH-BRACKET] Request:', { bracketId, hasImpersonation: !!impersonationId });

    if (!bracketId) {
      return new Response(
        JSON.stringify({ error: 'bracketId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2️⃣ Create clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error('[PUBLISH-BRACKET] Auth error:', authError);
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
      .single();

    if (bracketError || !bracket) {
      console.error('[PUBLISH-BRACKET] Bracket not found:', bracketError);
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

    // 4️⃣ Check role
    const roleCheck = await requireTenantRole(
      supabaseAdmin, 
      req.headers.get('Authorization'), 
      tenantId, 
      ['ADMIN_TENANT']
    );
    if (!roleCheck.allowed) {
      console.warn('[PUBLISH-BRACKET] Role check failed:', roleCheck.error);
      return new Response(
        JSON.stringify({ error: roleCheck.error }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5️⃣ Check impersonation if superadmin
    const impersonationCheck = await requireImpersonationIfSuperadmin(
      supabaseAdmin,
      user.id,
      tenantId,
      impersonationId
    );

    if (!impersonationCheck.valid) {
      console.warn('[PUBLISH-BRACKET] Impersonation check failed:', impersonationCheck.error);
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
      console.error('[PUBLISH-BRACKET] Update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to publish bracket' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[PUBLISH-BRACKET] Success! Bracket:', bracketId, 'Version:', bracket.version);

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
    console.error('[PUBLISH-BRACKET] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
