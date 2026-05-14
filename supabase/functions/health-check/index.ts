import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import { okResponse, buildSuccessEnvelope } from "../_shared/errors/envelope.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";

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
  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("health-check", correlationId);
  const startMs = performance.now();
  const checks: HealthPayload["checks"] = {};
  log.info("health-check invoked");

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

  // Check 3: Upstash Redis (rate limiter). When Redis is down the secure rate
  // limiter fails closed, blocking every protected endpoint — so this needs
  // to surface in health output instead of being invisible until the first
  // 503 from a real request.
  try {
    const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
    const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
    if (redisUrl && redisToken) {
      const redisStart = performance.now();
      const resp = await fetch(`${redisUrl}/ping`, {
        headers: { Authorization: `Bearer ${redisToken}` },
      });
      const redisLatency = Math.round(performance.now() - redisStart);
      checks["redis"] = resp.ok
        ? { status: "HEALTHY", latencyMs: redisLatency }
        : { status: "DEGRADED", latencyMs: redisLatency };
    } else {
      checks["redis"] = { status: "NOT_CONFIGURED" };
    }
  } catch {
    checks["redis"] = { status: "UNREACHABLE" };
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
