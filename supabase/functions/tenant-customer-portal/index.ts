/**
 * ============================================================================
 * 🏢 tenant-customer-portal — Stripe Billing Portal Access
 * ============================================================================
 * 
 * IMMUTABLE CONTRACT:
 * -------------------
 * This function creates a Stripe Customer Portal session for authorized
 * tenant administrators to manage their billing and subscription.
 * 
 * THIS IS A SELF-SERVICE TOOL, NOT A BILLING DECISION MAKER.
 * 
 * WHAT THIS FUNCTION DOES:
 * - Validates caller has appropriate role for the tenant
 * - Fetches tenant's stripe_customer_id from tenant_billing
 * - Creates a Stripe Billing Portal session
 * - Returns the portal URL for redirect
 * 
 * WHAT THIS FUNCTION DOES NOT DO:
 * - Does NOT modify subscription directly
 * - Does NOT process payments
 * - Does NOT update billing records in our database
 * - Does NOT handle webhook events
 * - Does NOT decide billing status
 * - Does NOT cancel or upgrade plans
 * 
 * SECURITY BOUNDARY:
 * - Only ADMIN_TENANT, STAFF_ORGANIZACAO, or SUPERADMIN_GLOBAL can access
 * - Stripe customer must exist for tenant
 * - Portal actions are handled by Stripe, not by us
 * 
 * WHY STRIPE PORTAL?
 * - Customers manage their own payment methods
 * - Customers can view invoices and receipts
 * - Customers can upgrade/downgrade (if configured)
 * - We don't handle sensitive payment data
 * 
 * ============================================================================
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// ============================================================================
// CORS HEADERS
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// LOGGING HELPER
// NOTE: Pre-existing logging preserved for operational visibility
// ============================================================================

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[TENANT-CUSTOMER-PORTAL] ${step}${detailsStr}`);
};

// ============================================================================
// ENTRYPOINT
// ============================================================================

serve(async (req) => {
  // --- CORS Preflight ---
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    // ========================================================================
    // STEP 1: Environment Validation
    // SECURITY BOUNDARY: Function cannot operate without Stripe key
    // ========================================================================
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    // ========================================================================
    // STEP 2: Supabase Client Initialization
    // ========================================================================
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // ========================================================================
    // STEP 3: Authorization Validation
    // ========================================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.id) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // ========================================================================
    // STEP 4: Request Body Validation
    // ========================================================================
    const { tenant_id: tenantId } = await req.json();
    if (!tenantId) throw new Error("tenant_id is required");
    logStep("Request body parsed", { tenant_id: tenantId });

    // ========================================================================
    // STEP 5: Role Authorization Check
    // SECURITY BOUNDARY: Only specific roles can access billing portal
    // BY DESIGN: ADMIN_TENANT, STAFF_ORGANIZACAO, or SUPERADMIN_GLOBAL
    // ========================================================================
    const { data: tenantRoles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .in('role', ['ADMIN_TENANT', 'STAFF_ORGANIZACAO']);

    // Also check for global superadmin (tenant_id IS NULL)
    const { data: globalRoles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'SUPERADMIN_GLOBAL')
      .is('tenant_id', null);

    const isAuthorized = (tenantRoles && tenantRoles.length > 0) || (globalRoles && globalRoles.length > 0);
    if (!isAuthorized) {
      throw new Error("User is not authorized to access billing for this tenant");
    }
    logStep("User authorized", { tenantRoles, globalRoles });

    // ========================================================================
    // STEP 6: Fetch Stripe Customer ID
    // DOES NOT modify billing records
    // ========================================================================
    const { data: billingData, error: billingError } = await supabaseClient
      .from('tenant_billing')
      .select('stripe_customer_id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (billingError) throw billingError;
    
    if (!billingData?.stripe_customer_id) {
      throw new Error("No Stripe customer found for this tenant");
    }
    logStep("Found Stripe customer", { customerId: billingData.stripe_customer_id });

    // ========================================================================
    // STEP 7: Create Stripe Portal Session
    // INTENTIONAL: We only create the session, Stripe handles the rest
    // DOES NOT modify subscription or billing in our database
    // ========================================================================
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || "https://tatame-pro.lovable.app";
    
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: billingData.stripe_customer_id,
      return_url: `${origin}/`,
    });
    logStep("Customer portal session created", { sessionId: portalSession.id, url: portalSession.url });

    // ========================================================================
    // STEP 8: Success Response
    // Returns URL only; customer interacts with Stripe, not us
    // ========================================================================
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
