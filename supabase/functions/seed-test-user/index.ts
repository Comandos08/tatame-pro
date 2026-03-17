import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";

interface SeedUserRequest {
  email: string;
  password: string;
  name: string;
  athleteId?: string;
  tenantId?: string;
  seedSecret?: string;
}

// Internal seed function - uses service role key directly
// Only for controlled test data seeding
function getInternalSecret(req: Request, bodySecret?: string): string {
  return req.headers.get("x-seed-secret")?.trim() || bodySecret?.trim() || "";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("seed-test-user", correlationId);
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  try {
    const seedEnabled = Deno.env.get("SEED_TEST_USER_ENABLED") === "true";
    const expectedSecret = Deno.env.get("SEED_TEST_USER_SECRET")?.trim() || "";

    if (!seedEnabled || !expectedSecret) {
      log.warn("Seed endpoint disabled or missing secret");
      return new Response(
        JSON.stringify({ error: "SEED_ENDPOINT_DISABLED" }),
        { status: 403, headers: { ...dynamicCors, "Content-Type": "application/json" } },
      );
    }

    const payload: SeedUserRequest = await req.json();
    const providedSecret = getInternalSecret(req, payload.seedSecret);

    if (!providedSecret || providedSecret !== expectedSecret) {
      log.warn("Invalid seed secret");
      return new Response(
        JSON.stringify({ error: "FORBIDDEN" }),
        { status: 403, headers: { ...dynamicCors, "Content-Type": "application/json" } },
      );
    }

    const { email, password, name, athleteId, tenantId } = payload;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      log.error("Server configuration missing", { hasUrl: !!supabaseUrl, hasServiceRole: !!serviceRoleKey });
      return new Response(
        JSON.stringify({ error: "SERVER_CONFIGURATION_ERROR" }),
        { status: 500, headers: { ...dynamicCors, "Content-Type": "application/json" } },
      );
    }

    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, password, name" }),
        { status: 400, headers: { ...dynamicCors, "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email);

    if (existingUser) {
      // User exists, just link the athlete if needed
      if (athleteId) {
        await supabaseAdmin
          .from("athletes")
          .update({ profile_id: existingUser.id })
          .eq("id", athleteId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          userId: existingUser.id,
          email,
          message: "User already exists, athlete linked",
        }),
        { status: 200, headers: { ...dynamicCors, "Content-Type": "application/json" } },
      );
    }

    // Create user in auth
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (createError) {
      log.error("Error creating user", createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...dynamicCors, "Content-Type": "application/json" } },
      );
    }

    const userId = newUser.user.id;

    // Update profile with tenant if provided
    if (tenantId) {
      await supabaseAdmin
        .from("profiles")
        .update({ tenant_id: tenantId, name })
        .eq("id", userId);
    }

    // Link athlete to profile if provided
    if (athleteId) {
      await supabaseAdmin
        .from("athletes")
        .update({ profile_id: userId })
        .eq("id", athleteId);

      // Add ATLETA role
      if (tenantId) {
        await supabaseAdmin
          .from("user_roles")
          .insert({
            user_id: userId,
            role: "ATLETA",
            tenant_id: tenantId,
          });
      }
    }

    log.info("Seed user created successfully", { userId, email, athleteId });

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        email,
        message: "User created and linked successfully",
      }),
      { status: 200, headers: { ...dynamicCors, "Content-Type": "application/json" } },
    );
  } catch (error) {
    log.error("Error in seed-test-user", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...dynamicCors, "Content-Type": "application/json" } },
    );
  }
});
