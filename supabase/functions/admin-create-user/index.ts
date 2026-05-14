import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import { RATE_LIMIT_PRESETS, buildRateLimitContext } from "../_shared/secure-rate-limiter.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";


interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  athleteId?: string;
  tenantId?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("admin-create-user", correlationId);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is superadmin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.missing_token", false, undefined, correlationId),
        dynamicCors,
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.invalid_token", false, undefined, correlationId),
        dynamicCors,
      );
    }

    // Check if caller is superadmin
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "SUPERADMIN_GLOBAL");

    if (!roles || roles.length === 0) {
      return errorResponse(
        403,
        buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.forbidden", false, ["SUPERADMIN_GLOBAL required"], correlationId),
        dynamicCors,
      );
    }

    // Rate limiting: 10 user creations per hour per superadmin
    const rateLimiter = RATE_LIMIT_PRESETS.adminCreateUser();
    const rlContext = buildRateLimitContext(req, caller.id, null);
    const rlResult = await rateLimiter.check(rlContext);
    if (!rlResult.allowed) {
      log.warn("Rate limit exceeded for admin-create-user", { userId: caller.id });
      return rateLimiter.tooManyRequestsResponse(rlResult, dynamicCors, correlationId);
    }

    const { email, password, name, athleteId, tenantId }: CreateUserRequest = await req.json();

    if (!email || !password || !name) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.required_field", false, ["email, password and name are required"], correlationId),
        dynamicCors,
      );
    }

    // Create user in auth
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for admin-created users
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

    // Update profile with tenant if provided, and always mark wizard_completed = true
    // so the created user can log in directly without being sent to the identity wizard.
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
        await supabaseAdmin.rpc(
          'grant_user_role',
          { p_user_id: userId, p_tenant_id: tenantId, p_role: 'ATLETA' }
        );
      }
    }

    // Audit log for role grant (if ATLETA was assigned)
    if (athleteId && tenantId) {
      await supabaseAdmin.from("audit_logs").insert({
        tenant_id: tenantId,
        profile_id: caller.id,
        event_type: "ROLES_GRANTED",
        metadata: {
          target_user_id: userId,
          target_email: email,
          roles_granted: ["ATLETA"],
          granted_by: caller.id,
          source: "admin-create-user",
        },
      });
    }

    log.info("User created successfully", { userId, email });

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
    const message = error instanceof Error ? error.message : "Unknown error";
    log.error("Error in admin-create-user", error);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, [message], correlationId),
      dynamicCors,
    );
  }
});
