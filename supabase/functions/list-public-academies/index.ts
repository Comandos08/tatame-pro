/**
 * 🏢 list-public-academies — Public tenant-scoped academy listing
 *
 * SECURITY (PI U7.F2 + PI A08.H2):
 * - Uses service_role for controlled data access
 * - Tenant resolved by slug (no cross-tenant enumeration)
 * - Only returns active academies from valid tenants
 * - No PII exposed (academy data is institutional/public)
 * - Fail-closed: invalid slug → empty result
 * - Anti-enumeration: institutional pagination enforced (A08.H2)
 *
 * @see docs/security/rls-vs-edge-functions.md §3
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parsePublicPagination } from "../_shared/security/publicQueryLimits.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";


export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  try {
    const url = new URL(req.url);
    const tenantSlug = url.searchParams.get("tenant_slug");

    if (!tenantSlug || typeof tenantSlug !== "string" || tenantSlug.length > 100) {
      return errorResponse(
        400,
        buildErrorEnvelope(
          ERROR_CODES.VALIDATION_ERROR,
          "public.tenant_slug_invalid",
          false,
          ["tenant_slug missing or invalid"],
        ),
        dynamicCors,
      );
    }

    // Validate slug format (alphanumeric + hyphens only)
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(tenantSlug) && !/^[a-z0-9]$/i.test(tenantSlug)) {
      return errorResponse(
        400,
        buildErrorEnvelope(
          ERROR_CODES.VALIDATION_ERROR,
          "public.tenant_slug_format_invalid",
          false,
          ["tenant_slug must be alphanumeric with hyphens"],
        ),
        dynamicCors,
      );
    }

    // A08.H2 — Anti-enumeration: enforce institutional pagination limits
    const pag = parsePublicPagination(req, dynamicCors);
    if (!pag.ok) return pag.response;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Resolve tenant by slug
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, lifecycle_status")
      .eq("slug", tenantSlug)
      .maybeSingle();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ academies: [] }),
        { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Fail-closed: only serve active tenants
    if (tenant.lifecycle_status !== "ACTIVE") {
      return new Response(
        JSON.stringify({ academies: [] }),
        { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Step 2: Fetch active academies with deterministic ordering and institutional limit
    const { data: academies, error: academiesError } = await supabase
      .from("academies")
      .select("id, name, city, state, sport_type")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .range(pag.offset, pag.offset + pag.limit - 1);

    if (academiesError) {
      return errorResponse(
        500,
        buildErrorEnvelope(
          ERROR_CODES.INTERNAL_ERROR,
          "public.academies_fetch_failed",
          true,
          ["database error while fetching academies"],
        ),
        dynamicCors,
      );
    }

    return new Response(
      JSON.stringify({ academies: academies || [] }),
      { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    return errorResponse(
      500,
      buildErrorEnvelope(
        ERROR_CODES.INTERNAL_ERROR,
        "system.internal_error",
        true,
      ),
      dynamicCors,
    );
  }
};

serve(handler);
