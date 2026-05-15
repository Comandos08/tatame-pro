/**
 * connect-onboarding-start — Stripe Connect (Express) onboarding kickoff.
 *
 * Tatame Pro is a marketplace. A Tenant must connect a Stripe Express account
 * before it can receive membership/event fees (destination charges). This
 * function:
 *   1. Authorizes the caller as ADMIN_TENANT (or SUPERADMIN_GLOBAL) of the tenant
 *   2. Creates a Stripe Express account if the tenant doesn't have one
 *   3. Returns a Stripe-hosted Account Link the admin opens to complete KYC
 *
 * SECURITY:
 * - Tenant-scoped: caller must administer the tenant
 * - Service role used only for the privileged tenants UPDATE
 * - No secrets returned to the client (only the hosted onboarding URL)
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { requireTenantRole } from "../_shared/requireTenantRole.ts";
import { createAuditLog } from "../_shared/audit-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";

interface OnboardingStartRequest {
  tenantId: string;
  returnUrl?: string;
  refreshUrl?: string;
}

const PUBLIC_APP_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://tatame.pro";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);
  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("connect-onboarding-start", correlationId);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!supabaseUrl || !supabaseServiceKey || !stripeSecretKey) {
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.misconfigured", false, undefined, correlationId),
        dynamicCors,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    const body: OnboardingStartRequest = await req.json().catch(() => ({} as OnboardingStartRequest));
    const { tenantId } = body;

    if (!tenantId) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.required_field", false, ["tenantId is required"], correlationId),
        dynamicCors,
      );
    }

    // AUTH — must administer this tenant
    const roleCheck = await requireTenantRole(supabase, authHeader, tenantId, ["ADMIN_TENANT"]);
    if (!roleCheck.allowed) {
      log.warn("Permission denied", { error: roleCheck.error });
      return errorResponse(
        roleCheck.userId ? 403 : 401,
        buildErrorEnvelope(
          roleCheck.userId ? ERROR_CODES.FORBIDDEN : ERROR_CODES.UNAUTHORIZED,
          roleCheck.userId ? "auth.forbidden" : "auth.invalid_token",
          false,
          roleCheck.error ? [roleCheck.error] : undefined,
          correlationId,
        ),
        dynamicCors,
      );
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, slug, stripe_connect_account_id, stripe_connect_charges_enabled")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantError || !tenant) {
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "data.not_found", false, ["tenant"], correlationId),
        dynamicCors,
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    // Create the Express account on first onboarding.
    let accountId = tenant.stripe_connect_account_id as string | null;
    let createdNow = false;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "BR",
        business_type: "company",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: tenant.name,
          product_description: "Filiações e inscrições em eventos esportivos (Tatame Pro)",
        },
        metadata: {
          tenant_id: tenant.id,
          tenant_slug: tenant.slug,
        },
      });
      accountId = account.id;
      createdNow = true;

      const { error: updErr } = await supabase
        .from("tenants")
        .update({
          stripe_connect_account_id: accountId,
          stripe_connect_updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId);
      if (updErr) {
        log.error("Failed to persist connect account id", updErr);
        return errorResponse(
          500,
          buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.query_failed", true, ["failed to persist connect account"], correlationId),
          dynamicCors,
        );
      }

      await createAuditLog(supabase, {
        event_type: "STRIPE_CONNECT_ACCOUNT_CREATED",
        tenant_id: tenantId,
        profile_id: roleCheck.userId,
        metadata: { stripe_account_id: accountId, source: "connect-onboarding-start" },
      });
    }

    const base = `${PUBLIC_APP_URL}/${tenant.slug}/app/settings`;
    const returnUrl = body.returnUrl || `${base}?connect=return`;
    const refreshUrl = body.refreshUrl || `${base}?connect=refresh`;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    log.info("Onboarding link created", { tenantId, accountId, createdNow });

    return okResponse(
      {
        onboardingUrl: accountLink.url,
        accountId,
        createdNow,
        chargesEnabled: tenant.stripe_connect_charges_enabled === true,
      },
      dynamicCors,
      correlationId,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log.error("connect-onboarding-start failed", error);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, [message], correlationId),
      dynamicCors,
    );
  }
});
