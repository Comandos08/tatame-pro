import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MembershipCheckoutRequest {
  membershipId: string;
  tenantSlug: string;
  successUrl: string;
  cancelUrl: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

    if (!stripeSecretKey) {
      throw new Error("Stripe secret key not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    const { membershipId, tenantSlug, successUrl, cancelUrl }: MembershipCheckoutRequest = await req.json();

    if (!membershipId || !tenantSlug) {
      throw new Error("Missing required fields: membershipId and tenantSlug");
    }

    // Fetch membership with athlete and tenant data
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select(`
        *,
        athlete:athletes(*),
        tenant:tenants(*)
      `)
      .eq("id", membershipId)
      .maybeSingle();

    if (membershipError || !membership) {
      throw new Error(membershipError?.message || "Membership not found");
    }

    if (membership.payment_status === "PAID") {
      throw new Error("This membership has already been paid");
    }

    const athlete = membership.athlete;
    const tenant = membership.tenant;

    if (!athlete || !tenant) {
      throw new Error("Invalid membership data");
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer_email: athlete.email,
      line_items: [
        {
          price_data: {
            currency: membership.currency.toLowerCase(),
            product_data: {
              name: `Filiação - ${tenant.name}`,
              description: `Filiação de atleta para ${tenant.name}`,
            },
            unit_amount: membership.price_cents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${successUrl}?membership_id=${membershipId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        membership_id: membershipId,
        tenant_id: tenant.id,
        athlete_id: athlete.id,
      },
    });

    // Update membership with checkout session id and status
    const { error: updateError } = await supabase
      .from("memberships")
      .update({
        stripe_checkout_session_id: session.id,
        status: "PENDING_PAYMENT",
      })
      .eq("id", membershipId);

    if (updateError) {
      console.error("Failed to update membership:", updateError);
    }

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error creating checkout session:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
