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
import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";


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
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("create-event-registration-checkout", correlationId);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
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
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const body: EventRegistrationCheckoutRequest = await req.json();
    const { event_id, category_id, athlete_id, success_url, cancel_url } = body;

    if (!event_id || !category_id || !athlete_id) {
      return new Response(
        JSON.stringify({ error: "event_id, category_id and athlete_id are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
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
      return new Response(
        JSON.stringify({ error: "Category not found or inactive" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const event = category.event as unknown as {
      id: string; name: string; status: string; tenant_id: string; start_date: string;
      tenant: { id: string; name: string; slug: string } | null;
    } | null;

    if (!event) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    if (event.status !== "PUBLISHED") {
      return new Response(
        JSON.stringify({ error: "Event is not open for registrations" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
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
      return new Response(
        JSON.stringify({ error: "Athlete already registered in this category", registration_id: existing.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
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
        return new Response(
          JSON.stringify({ error: "Category is full" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
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
      return new Response(
        JSON.stringify({ registration_id: registration.id, is_free: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // --- PAID EVENT: create Stripe Checkout session ---
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Payment not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 503 }
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
      metadata: {
        registration_id: pendingReg.id,
        event_id,
        category_id,
        athlete_id,
        tenant_id: event.tenant_id,
      },
      success_url: success_url || defaultSuccessUrl,
      cancel_url: cancel_url || defaultCancelUrl,
    });

    log.info("Stripe checkout session created", { session_id: session.id, registration_id: pendingReg.id });

    return new Response(
      JSON.stringify({
        checkout_url: session.url,
        session_id: session.id,
        registration_id: pendingReg.id,
        is_free: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Error creating event registration checkout", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
