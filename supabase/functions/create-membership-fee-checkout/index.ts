import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { requireTenantRole } from "../_shared/requireTenantRole.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateFeeCheckoutRequest {
  membership_id: string;
  success_url: string;
  cancel_url: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const log = createBackendLogger("create-membership-fee-checkout");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    const authHeader = req.headers.get("Authorization");
    const payload: CreateFeeCheckoutRequest = await req.json();
    
    // Validar autenticação (atleta pode pagar sua própria filiação)
    const authResult = await requireTenantRole(
      authHeader,
      ["ADMIN_TENANT", "ATLETA"],
      null,
      supabase
    );

    if (!authResult.valid) {
      return new Response(
        JSON.stringify({ error: authResult.error }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar membership
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select(`
        id, 
        tenant_id, 
        fee_amount_cents, 
        payment_status,
        athletes(email, full_name)
      `)
      .eq("id", payload.membership_id)
      .single();

    if (membershipError || !membership) {
      log.error("Membership not found", { membership_id: payload.membership_id });
      return new Response(
        JSON.stringify({ error: "Membership not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validar que fee ainda não foi pago
    if (membership.payment_status === "PAID") {
      return new Response(
        JSON.stringify({ error: "Membership fee already paid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const athleteEmail = membership.athletes?.email || "";
    const athleteName = membership.athletes?.full_name || "Atleta";

    // Criar Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "brl",
            product_data: {
              name: "Taxa de Filiação",
              description: `Filiação de ${athleteName}`,
            },
            unit_amount: membership.fee_amount_cents || 15000,
          },
          quantity: 1,
        },
      ],
      metadata: {
        membership_id: membership.id,
        tenant_id: membership.tenant_id,
        type: "membership_fee",
      },
      customer_email: athleteEmail,
      success_url: payload.success_url,
      cancel_url: payload.cancel_url,
    });

    // Salvar checkout session
    await supabase.from("membership_fees").insert({
      membership_id: membership.id,
      tenant_id: membership.tenant_id,
      amount_cents: membership.fee_amount_cents || 15000,
      stripe_checkout_session_id: session.id,
    });

    // Atualizar membership
    await supabase
      .from("memberships")
      .update({ 
        stripe_checkout_session_id: session.id,
        payment_status: "PENDING",
      })
      .eq("id", membership.id);

    log.info("Checkout session created", { 
      membership_id: membership.id,
      session_id: session.id,
    });

    return new Response(
      JSON.stringify({ 
        checkout_url: session.url,
        session_id: session.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log.error("Error creating checkout", { error: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
