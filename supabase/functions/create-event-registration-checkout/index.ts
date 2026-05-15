/**
 * create-event-registration-checkout — Event Registration with Optional Stripe Checkout (I-09)
 *
 * For free events (price_cents = 0): creates registration directly with CONFIRMED status.
 * For paid events (price_cents > 0): creates a Stripe Checkout session and returns the URL.
 *
 * Requires: authenticated user (athlete registering themselves or admin)
 * Rate limit: 5 registrations per 10 minutes per athlete (Upstash, fail-open for events)
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import { RATE_LIMIT_PRESETS, buildRateLimitContext } from "../_shared/secure-rate-limiter.ts";
import { getTenantConnectInfo, buildDestinationChargeParams } from "../_shared/connect.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";


const BASE_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://tatame-pro.lovable.app";

interface EventRegistrationCheckoutRequest {
  event_id: string;
  category_id: string;
  athlete_id: string;
  success_url?: string;
  cancel_url?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("create-event-registration-checkout", correlationId);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.missing_token", false, undefined, correlationId),
        dynamicCors,
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify the calling user
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.invalid_token", false, undefined, correlationId),
        dynamicCors,
      );
    }

    // The file header comment promised "5 registrations per 10 minutes per
    // athlete (Upstash, fail-open for events)" but the limiter was never
    // wired. Adding it here so the documented contract matches the runtime.
    const rateLimiter = RATE_LIMIT_PRESETS.eventRegistrationCheckout();
    const rlContext = buildRateLimitContext(req, user.id, null);
    const rlResult = await rateLimiter.check(rlContext);
    if (!rlResult.allowed) {
      log.warn("Rate limit exceeded for event registration checkout", { userId: user.id });
      return rateLimiter.tooManyRequestsResponse(rlResult, dynamicCors, correlationId);
    }

    const body: EventRegistrationCheckoutRequest = await req.json();
    const { event_id, category_id, athlete_id, success_url, cancel_url } = body;

    if (!event_id || !category_id || !athlete_id) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.required_field", false, ["event_id, category_id and athlete_id are required"], correlationId),
        dynamicCors,
      );
    }

    log.info("Processing event registration checkout", { event_id, category_id, athlete_id });

    // Fetch event + category in one go
    const { data: category, error: catError } = await supabase
      .from("event_categories")
      .select(`
        id, name, price_cents, currency, max_participants,
        event:events(id, name, status, tenant_id, start_date,
          tenant:tenants(id, name, slug))
      `)
      .eq("id", category_id)
      .eq("event_id", event_id)
      .eq("is_active", true)
      .maybeSingle();

    if (catError || !category) {
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "data.not_found", false, ["category not found or inactive"], correlationId),
        dynamicCors,
      );
    }

    const event = category.event as unknown as {
      id: string; name: string; status: string; tenant_id: string; start_date: string;
      tenant: { id: string; name: string; slug: string } | null;
    } | null;

    if (!event) {
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "data.not_found", false, ["event"], correlationId),
        dynamicCors,
      );
    }

    if (event.status !== "PUBLISHED") {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.invalid_state", false, ["event not open for registrations"], correlationId),
        dynamicCors,
      );
    }

    // Check for existing registration
    const { data: existing } = await supabase
      .from("event_registrations")
      .select("id, status")
      .eq("event_id", event_id)
      .eq("category_id", category_id)
      .eq("athlete_id", athlete_id)
      .maybeSingle();

    if (existing && existing.status !== "CANCELED") {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.duplicate", false, [`athlete already registered (registration_id=${existing.id})`], correlationId),
        dynamicCors,
      );
    }

    // Check max participants
    if (category.max_participants) {
      const { count } = await supabase
        .from("event_registrations")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event_id)
        .eq("category_id", category_id)
        .neq("status", "CANCELED");

      if ((count ?? 0) >= category.max_participants) {
        return errorResponse(
          409,
          buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.invalid_state", false, ["category is full"], correlationId),
          dynamicCors,
        );
      }
    }

    // Fetch athlete profile for Stripe metadata / email
    const { data: athlete } = await supabase
      .from("athletes")
      .select("id, full_name, email")
      .eq("id", athlete_id)
      .maybeSingle();

    // --- FREE EVENT: create registration directly ---
    if (!category.price_cents || category.price_cents === 0) {
      const { data: registration, error: regError } = await supabase
        .from("event_registrations")
        .upsert({
          event_id,
          category_id,
          athlete_id,
          tenant_id: event.tenant_id,
          status: "CONFIRMED",
          payment_status: "NOT_PAID",
          registered_by: user.id,
        }, { onConflict: "event_id,category_id,athlete_id", ignoreDuplicates: false })
        .select("id")
        .single();

      if (regError) {
        throw new Error(`Failed to create registration: ${regError.message}`);
      }

      log.info("Free event registration created", { registration_id: registration.id });
      return okResponse(
        { registration_id: registration.id, is_free: true },
        dynamicCors,
        correlationId,
      );
    }

    // --- PAID EVENT: create Stripe Checkout session ---
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return errorResponse(
        503,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.misconfigured", true, ["payment not configured"], correlationId),
        dynamicCors,
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-12-18.acacia" });

    const tenantSlug = event.tenant?.slug || event.tenant_id;
    const defaultSuccessUrl = `${BASE_URL}/${tenantSlug}/events/${event_id}?registration=success`;
    const defaultCancelUrl = `${BASE_URL}/${tenantSlug}/events/${event_id}?registration=canceled`;

    // Create a pending registration to link to checkout
    const { data: pendingReg, error: pendingError } = await supabase
      .from("event_registrations")
      .upsert({
        event_id,
        category_id,
        athlete_id,
        tenant_id: event.tenant_id,
        status: "PENDING",
        payment_status: "NOT_PAID",
        registered_by: user.id,
      }, { onConflict: "event_id,category_id,athlete_id", ignoreDuplicates: false })
      .select("id")
      .single();

    if (pendingError) {
      throw new Error(`Failed to create pending registration: ${pendingError.message}`);
    }

    // MARKETPLACE — destination charge. The event fee belongs to the Tenant.
    // Soft fallback (Phase 1+2): legacy platform charge when the Tenant has
    // not completed Connect onboarding, plus a CRITICAL telemetry event.
    const connectInfo = await getTenantConnectInfo(supabase, event.tenant_id);
    const destinationParams = buildDestinationChargeParams(
      connectInfo,
      category.price_cents,
    );

    if (!destinationParams) {
      log.warn("Tenant not Connect-ready — falling back to platform charge", {
        tenantId: event.tenant_id,
        hasAccount: !!connectInfo?.stripeConnectAccountId,
        chargesEnabled: connectInfo?.chargesEnabled ?? false,
      });
      await supabase.from("institutional_events").insert({
        event_type: "BILLING_CONNECT_FALLBACK_PLATFORM_CHARGE",
        severity: "CRITICAL",
        source: "create-event-registration-checkout",
        tenant_id: event.tenant_id,
        metadata: {
          registration_id: pendingReg.id,
          event_id,
          category_id,
          reason: connectInfo?.stripeConnectAccountId
            ? "charges_not_enabled"
            : "no_connect_account",
          amount_cents: category.price_cents,
        },
      }).then(undefined, () => { /* fail-silent: never block checkout on telemetry */ });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: (category.currency || "BRL").toLowerCase(),
            unit_amount: category.price_cents,
            product_data: {
              name: `Inscrição — ${category.name}`,
              description: `${event.name} · ${new Date(event.start_date).toLocaleDateString("pt-BR")}`,
            },
          },
        },
      ],
      customer_email: athlete?.email,
      ...(destinationParams ? { payment_intent_data: destinationParams } : {}),
      metadata: {
        registration_id: pendingReg.id,
        event_id,
        category_id,
        athlete_id,
        tenant_id: event.tenant_id,
        connect_mode: destinationParams ? "destination" : "platform_fallback",
      },
      success_url: success_url || defaultSuccessUrl,
      cancel_url: cancel_url || defaultCancelUrl,
    });

    log.info("Stripe checkout session created", { session_id: session.id, registration_id: pendingReg.id });

    return okResponse(
      {
        checkout_url: session.url,
        session_id: session.id,
        registration_id: pendingReg.id,
        is_free: false,
      },
      dynamicCors,
      correlationId,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Error creating event registration checkout", error);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, [errorMessage], correlationId),
      dynamicCors,
    );
  }
});
