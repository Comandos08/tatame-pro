import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const checks: Record<string, { status: string; latencyMs?: number }> = {};

  // Check 1: Supabase Database connectivity
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const dbStart = Date.now();
    const { error } = await supabase.from("tenants").select("id").limit(1);
    const dbLatency = Date.now() - dbStart;

    checks["database"] = error
      ? { status: "UNHEALTHY", latencyMs: dbLatency }
      : { status: "HEALTHY", latencyMs: dbLatency };
  } catch {
    checks["database"] = { status: "UNREACHABLE" };
  }

  // Check 2: Stripe connectivity (optional — only if key exists)
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey) {
      const stripeStart = Date.now();
      const resp = await fetch("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      const stripeLatency = Date.now() - stripeStart;
      checks["stripe"] = resp.ok
        ? { status: "HEALTHY", latencyMs: stripeLatency }
        : { status: "DEGRADED", latencyMs: stripeLatency };
    } else {
      checks["stripe"] = { status: "NOT_CONFIGURED" };
    }
  } catch {
    checks["stripe"] = { status: "UNREACHABLE" };
  }

  // Aggregate
  const allHealthy = Object.values(checks).every(
    (c) => c.status === "HEALTHY" || c.status === "NOT_CONFIGURED"
  );

  const totalLatency = Date.now() - startTime;

  return new Response(
    JSON.stringify({
      status: allHealthy ? "HEALTHY" : "DEGRADED",
      timestamp: new Date().toISOString(),
      totalLatencyMs: totalLatency,
      checks,
      version: "1.0.0",
    }),
    {
      status: allHealthy ? 200 : 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
