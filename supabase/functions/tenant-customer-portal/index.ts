import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[TENANT-CUSTOMER-PORTAL] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.id) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Get tenant_id from request body
    const { tenant_id } = await req.json();
    if (!tenant_id) throw new Error("tenant_id is required");
    logStep("Request body parsed", { tenant_id });

    // Check if user is admin or staff of this tenant
    const { data: roles, error: rolesError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant_id)
      .in('role', ['ADMIN_TENANT', 'STAFF_ORGANIZACAO']);

    // Also check for global superadmin
    const { data: globalRoles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'SUPERADMIN_GLOBAL')
      .is('tenant_id', null);

    const isAuthorized = (roles && roles.length > 0) || (globalRoles && globalRoles.length > 0);
    if (!isAuthorized) {
      throw new Error("User is not authorized to access billing for this tenant");
    }
    logStep("User authorized", { roles, globalRoles });

    // Get tenant billing info with Stripe customer ID
    const { data: billing, error: billingError } = await supabaseClient
      .from('tenant_billing')
      .select('stripe_customer_id')
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (billingError) throw billingError;
    
    if (!billing?.stripe_customer_id) {
      throw new Error("No Stripe customer found for this tenant");
    }
    logStep("Found Stripe customer", { customerId: billing.stripe_customer_id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || "https://tatame-pro.lovable.app";
    
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: `${origin}/`,
    });
    logStep("Customer portal session created", { sessionId: portalSession.id, url: portalSession.url });

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in tenant-customer-portal", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
