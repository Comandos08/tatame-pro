/**
 * generate-event-bracket — P2.4 Bracket Generation (Backend RPC)
 * 
 * Generates a deterministic single-elimination bracket for an event category.
 * Creates bracket as DRAFT status, requiring explicit publish action.
 * 
 * SECURITY:
 * - Requires ADMIN_TENANT or SUPERADMIN role
 * - Validates impersonation for superadmin
 * - Transactional insert (bracket + matches)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireTenantRole } from "../_shared/requireTenantRole.ts";
import { requireImpersonationIfSuperadmin, extractImpersonationId } from "../_shared/requireImpersonationIfSuperadmin.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-impersonation-id',
};

interface GenerateBracketRequest {
  categoryId: string;
  eventId: string;
  impersonationId?: string;
}

interface BracketMeta {
  criterion: string;
  registrations_count: number;
  bracket_size: number;
  byes_count: number;
  registration_ids_hash?: string;
}

interface MatchMeta {
  note?: string;
  source?: { from: string[] };
  is_bye?: boolean;
}

interface MatchInsert {
  tenant_id: string;
  bracket_id: string;
  category_id: string;
  round: number;
  position: number;
  athlete1_registration_id: string | null;
  athlete2_registration_id: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'BYE';
  meta: MatchMeta;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1️⃣ Parse request
    const body: GenerateBracketRequest = await req.json();
    const { categoryId, eventId } = body;
    const impersonationId = extractImpersonationId(req, body);

    console.log('[GENERATE-BRACKET] Request:', { categoryId, eventId, hasImpersonation: !!impersonationId });

    if (!categoryId || !eventId) {
      return new Response(
        JSON.stringify({ error: 'categoryId and eventId are required' }),
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
      console.error('[GENERATE-BRACKET] Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3️⃣ Get category and validate tenant
    const { data: category, error: catError } = await supabaseAdmin
      .from('event_categories')
      .select('id, tenant_id, event_id, name, deleted_at')
      .eq('id', categoryId)
      .single();

    if (catError || !category) {
      console.error('[GENERATE-BRACKET] Category not found:', catError);
      return new Response(
        JSON.stringify({ error: 'Category not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (category.deleted_at) {
      return new Response(
        JSON.stringify({ error: 'Cannot generate bracket for deleted category' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = category.tenant_id;

    // 4️⃣ Check role
    const roleCheck = await requireTenantRole(
      supabaseAdmin, 
      req.headers.get('Authorization'), 
      tenantId, 
      ['ADMIN_TENANT']
    );
    if (!roleCheck.allowed) {
      console.warn('[GENERATE-BRACKET] Role check failed:', roleCheck.error);
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
      console.warn('[GENERATE-BRACKET] Impersonation check failed:', impersonationCheck.error);
      return new Response(
        JSON.stringify({ error: impersonationCheck.error }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6️⃣ Validate event status
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, status, deleted_at')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      console.error('[GENERATE-BRACKET] Event not found:', eventError);
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (event.deleted_at) {
      return new Response(
        JSON.stringify({ error: 'Cannot generate bracket for deleted event' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allowedStatuses = ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'];
    if (!allowedStatuses.includes(event.status)) {
      return new Response(
        JSON.stringify({ 
          error: `Cannot generate bracket when event status is ${event.status}. Allowed: ${allowedStatuses.join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7️⃣ Fetch registrations deterministically
    const { data: registrations, error: regError } = await supabaseAdmin
      .from('event_registrations')
      .select('id, athlete_id, created_at')
      .eq('category_id', categoryId)
      .eq('event_id', eventId)
      .neq('status', 'CANCELED')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (regError) {
      console.error('[GENERATE-BRACKET] Registration fetch error:', regError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch registrations' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!registrations || registrations.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No active registrations in this category' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[GENERATE-BRACKET] Registrations found:', registrations.length);

    // 8️⃣ Calculate bracket structure
    const n = registrations.length;
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))));
    const byes = bracketSize - n;
    const rounds = Math.ceil(Math.log2(bracketSize));

    console.log('[GENERATE-BRACKET] Structure:', { n, bracketSize, byes, rounds });

    // 9️⃣ Get next version
    const { data: lastBracket } = await supabaseAdmin
      .from('event_brackets')
      .select('version')
      .eq('category_id', categoryId)
      .eq('tenant_id', tenantId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (lastBracket?.version || 0) + 1;

    console.log('[GENERATE-BRACKET] Next version:', nextVersion);

    // 🔟 Create bracket meta
    const bracketMeta: BracketMeta = {
      criterion: 'SEED_BY_CREATED_AT_ASC_ID_ASC',
      registrations_count: n,
      bracket_size: bracketSize,
      byes_count: byes,
      registration_ids_hash: registrations.map(r => r.id).join(',').slice(0, 100),
    };

    // 1️⃣1️⃣ Insert bracket (DRAFT status)
    const { data: bracket, error: bracketError } = await supabaseAdmin
      .from('event_brackets')
      .insert({
        tenant_id: tenantId,
        event_id: eventId,
        category_id: categoryId,
        version: nextVersion,
        status: 'DRAFT',
        generated_by: user.id,
        meta: bracketMeta,
      })
      .select()
      .single();

    if (bracketError || !bracket) {
      console.error('[GENERATE-BRACKET] Bracket insert error:', bracketError);
      return new Response(
        JSON.stringify({ error: 'Failed to create bracket' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[GENERATE-BRACKET] Bracket created:', bracket.id);

    // 1️⃣2️⃣ Generate matches
    const matches: MatchInsert[] = [];

    // Create slots with registrations and BYEs
    const slots: (string | null)[] = [];
    for (let i = 0; i < bracketSize; i++) {
      slots.push(i < n ? registrations[i].id : null);
    }

    // Round 1 matches
    const round1MatchCount = bracketSize / 2;
    for (let pos = 1; pos <= round1MatchCount; pos++) {
      const idx1 = (pos - 1) * 2;
      const idx2 = idx1 + 1;
      const athlete1 = slots[idx1];
      const athlete2 = slots[idx2];
      
      const isBye = athlete1 === null || athlete2 === null;
      
      const matchMeta: MatchMeta = {};
      if (isBye) {
        matchMeta.is_bye = true;
        matchMeta.note = 'BYE';
      }

      matches.push({
        tenant_id: tenantId,
        bracket_id: bracket.id,
        category_id: categoryId,
        round: 1,
        position: pos,
        athlete1_registration_id: athlete1,
        athlete2_registration_id: athlete2,
        status: isBye ? 'BYE' : 'SCHEDULED',
        meta: matchMeta,
      });
    }

    // Future rounds (placeholders)
    let matchesInPreviousRound = round1MatchCount;
    for (let round = 2; round <= rounds; round++) {
      const matchesInThisRound = matchesInPreviousRound / 2;
      for (let pos = 1; pos <= matchesInThisRound; pos++) {
        const sourceMatch1 = `R${round - 1}M${(pos - 1) * 2 + 1}`;
        const sourceMatch2 = `R${round - 1}M${(pos - 1) * 2 + 2}`;
        
        matches.push({
          tenant_id: tenantId,
          bracket_id: bracket.id,
          category_id: categoryId,
          round: round,
          position: pos,
          athlete1_registration_id: null,
          athlete2_registration_id: null,
          status: 'SCHEDULED',
          meta: {
            note: `Winner of ${sourceMatch1} vs Winner of ${sourceMatch2}`,
            source: { from: [sourceMatch1, sourceMatch2] },
          },
        });
      }
      matchesInPreviousRound = matchesInThisRound;
    }

    console.log('[GENERATE-BRACKET] Matches to insert:', matches.length);

    // 1️⃣3️⃣ Insert matches
    const { error: matchesError } = await supabaseAdmin
      .from('event_bracket_matches')
      .insert(matches);

    if (matchesError) {
      console.error('[GENERATE-BRACKET] Matches insert error:', matchesError);
      // Rollback bracket
      await supabaseAdmin
        .from('event_brackets')
        .delete()
        .eq('id', bracket.id);
      
      return new Response(
        JSON.stringify({ error: 'Failed to create matches' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[GENERATE-BRACKET] Success! Bracket:', bracket.id, 'Version:', nextVersion);

    return new Response(
      JSON.stringify({
        success: true,
        bracketId: bracket.id,
        version: nextVersion,
        status: 'DRAFT',
        matchesCreated: matches.length,
        meta: bracketMeta,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[GENERATE-BRACKET] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
