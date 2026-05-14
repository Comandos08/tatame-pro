import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";

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
      return errorResponse(
        403,
        buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.forbidden", false, ["SEED_ENDPOINT_DISABLED"], correlationId),
        dynamicCors,
      );
    }

    const payload: SeedUserRequest = await req.json();
    const providedSecret = getInternalSecret(req, payload.seedSecret);

    if (!providedSecret || providedSecret !== expectedSecret) {
      log.warn("Invalid seed secret");
      return errorResponse(
        403,
        buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.forbidden", false, ["invalid seed secret"], correlationId),
        dynamicCors,
      );
    }

    const { email, password, name, athleteId, tenantId } = payload;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      log.error("Server configuration missing", { hasUrl: !!supabaseUrl, hasServiceRole: !!serviceRoleKey });
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.misconfigured", false, undefined, correlationId),
        dynamicCors,
      );
    }

    if (!email || !password || !name) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.required_field", false, ["email, password and name are required"], correlationId),
        dynamicCors,
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

      return okResponse(
        {
          success: true,
          userId: existingUser.id,
          email,
          message: "User already exists, athlete linked",
        },
        dynamicCors,
        correlationId,
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
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "system.user_creation_failed", false, [createError.message], correlationId),
        dynamicCors,
      );
    }

    const userId = newUser.user.id;

    // Update profile with tenant if provided, always mark wizard_completed = true
    if (tenantId) {
      await supabaseAdmin
        .from("profiles")
        .update({ tenant_id: tenantId, name, wizard_completed: true })
        .eq("id", userId);
    } else {
      await supabaseAdmin
        .from("profiles")
        .update({ name, wizard_completed: true })
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

    return okResponse(
      {
        success: true,
        userId,
        email,
        message: "User created and linked successfully",
      },
      dynamicCors,
      correlationId,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Error in seed-test-user", error);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, [message], correlationId),
      dynamicCors,
    );
  }
});
