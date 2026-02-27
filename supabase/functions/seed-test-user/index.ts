import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SeedUserRequest {
  email: string;
  password: string;
  name: string;
  athleteId?: string;
  tenantId?: string;
  seedSecret: string;
}

// Internal seed function - uses service role key directly
// Only for controlled test data seeding

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("seed-test-user", correlationId);

  try {
    // Basic rate limiting via checking origin (optional security layer)
    const origin = req.headers.get("origin") || "";
    const allowedOrigins = ["https://tatame-pro.lovable.app", "https://tatame.pro", "http://localhost"];
    const isAllowed = allowedOrigins.some(o => origin.startsWith(o)) || origin === "";
    
    if (!isAllowed) {
      return new Response(
        JSON.stringify({ error: "Origin not allowed" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { email, password, name, athleteId, tenantId }: Omit<SeedUserRequest, 'seedSecret'> = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, password, name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    
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
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log.error("Error in seed-test-user", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
