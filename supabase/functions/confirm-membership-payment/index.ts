/**
 * ============================================================================
 * 💳 confirm-membership-payment — Payment Confirmation Handler
 * ============================================================================
 * 
 * IMMUTABLE CONTRACT:
 * -------------------
 * This function confirms a Stripe checkout session payment and updates
 * the corresponding membership record with payment details.
 * 
 * WHAT THIS FUNCTION DOES:
 * - Retrieves Stripe checkout session
 * - Validates payment_status === "paid"
 * - Updates membership: payment_status, status, dates
 * - Triggers digital card generation (fire-and-forget)
 * 
 * WHAT THIS FUNCTION DOES NOT DO:
 * - Does NOT process refunds
 * - Does NOT handle subscription lifecycle
 * - Does NOT send emails (delegated to card generation)
 * - Does NOT modify billing configuration
 * 
 * SECURITY INVARIANTS:
 * - Stripe session ID must match membership record (BY DESIGN)
 * - Only updates if Stripe confirms payment (REQUIRED)
 * - Card generation is async fire-and-forget (INTENTIONAL)
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
// TYPE DEFINITIONS
// ============================================================================

interface ConfirmPaymentRequest {
  sessionId: string;
  membershipId: string;
}

// ============================================================================
// ENTRYPOINT
// ============================================================================

serve(async (req) => {
  // --- CORS Preflight ---
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========================================================================
    // STEP 1: Environment Validation
    // ========================================================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

    if (!stripeSecretKey) {
      throw new Error("Stripe secret key not configured");
    }

    // ========================================================================
    // STEP 2: Client Initialization
    // ========================================================================
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    // ========================================================================
    // STEP 3: Request Body Validation
    // ========================================================================
    const { sessionId, membershipId }: ConfirmPaymentRequest = await req.json();

    if (!sessionId || !membershipId) {
      throw new Error("Missing required fields: sessionId and membershipId");
    }

    // ========================================================================
    // STEP 4: Stripe Session Retrieval
    // ========================================================================
    const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);

    // ========================================================================
    // STEP 5: Payment Status Check
    // BY DESIGN: Only proceed if Stripe confirms payment
    // ========================================================================
    if (stripeSession.payment_status !== "paid") {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Payment not completed",
          status: stripeSession.payment_status 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // ========================================================================
    // STEP 6: Calculate Membership Dates
    // INTENTIONAL: 12-month membership period
    // ========================================================================
    const startDate = new Date();
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);

    // ========================================================================
    // STEP 7: Update Membership Record
    // BY DESIGN: Session ID must match for security
    // ========================================================================
    const { data: updatedMembership, error: updateError } = await supabase
      .from("memberships")
      .update({
        payment_status: "PAID",
        status: "PENDING_REVIEW",
        stripe_payment_intent_id: stripeSession.payment_intent as string,
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
      })
      .eq("id", membershipId)
      .eq("stripe_checkout_session_id", sessionId)
      .select()
      .maybeSingle();

    if (updateError) {
      throw new Error(`Failed to update membership: ${updateError.message}`);
    }

    if (!updatedMembership) {
      throw new Error("Membership not found or session mismatch");
    }

    // ========================================================================
    // STEP 8: Trigger Digital Card Generation
    // INTENTIONAL: Fire-and-forget, non-blocking
    // ========================================================================
    const generateCardUrl = `${supabaseUrl}/functions/v1/generate-digital-card`;
    fetch(generateCardUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ membershipId }),
    }).catch((err) => console.error("Failed to trigger card generation:", err));

    // ========================================================================
    // STEP 9: Success Response
    // ========================================================================
    return new Response(
      JSON.stringify({ 
        success: true, 
        membership: updatedMembership,
        message: "Payment confirmed successfully" 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error confirming payment:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
