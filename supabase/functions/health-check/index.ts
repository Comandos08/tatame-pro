import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import { okResponse, buildSuccessEnvelope } from "../_shared/errors/envelope.ts";

type HealthPayload = {
  status: "HEALTHY" | "DEGRADED";
  totalLatencyMs: number;
  checks: Record<string, { status: string; latencyMs?: number }>;
  version: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);
  const startMs = performance.now();
  const checks: HealthPayload["checks"] = {};

  // Check 1: Supabase Database connectivity
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const dbStart = performance.now();
    const { error } = await supabase.from("tenants").select("id").limit(1);
    const dbLatency = Math.round(performance.now() - dbStart);

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
      const stripeStart = performance.now();
      const resp = await fetch("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      const stripeLatency = Math.round(performance.now() - stripeStart);
      checks["stripe"] = resp.ok
        ? { status: "HEALTHY", latencyMs: stripeLatency }
        : { status: "DEGRADED", latencyMs: stripeLatency };
    } else {
      checks["stripe"] = { status: "NOT_CONFIGURED" };
    }
  } catch {
    checks["stripe"] = { status: "UNREACHABLE" };
  }

  const allHealthy = Object.values(checks).every(
    (c) => c.status === "HEALTHY" || c.status === "NOT_CONFIGURED"
  );
  const totalLatencyMs = Math.round(performance.now() - startMs);
  const payload: HealthPayload = {
    status: allHealthy ? "HEALTHY" : "DEGRADED",
    totalLatencyMs,
    checks,
    version: "1.0.0",
  };

  if (allHealthy) {
    return okResponse(payload, dynamicCors);
  }

  // DEGRADED: use success envelope shape but 503 so monitors can read structured data
  return new Response(JSON.stringify(buildSuccessEnvelope(payload)), {
    status: 503,
    headers: { ...dynamicCors, "Content-Type": "application/json" },
  });
});
