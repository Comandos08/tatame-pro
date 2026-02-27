import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  athleteId?: string;
  tenantId?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if caller is superadmin
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "SUPERADMIN_GLOBAL");

    if (!roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ error: "Forbidden: requires SUPERADMIN_GLOBAL role" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, name, athleteId, tenantId }: CreateUserRequest = await req.json();

    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, password, name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        email,
        message: "User created and linked successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log.error("Error in admin-create-user", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
