// ============= Full file contents =============

/**
 * 🔔 notify-critical-alert — P4.2.D
 * 
 * Stub for external alert notifications.
 * OFF by default — requires explicit enablement.
 * 
 * Future integrations:
 * - Slack webhook
 * - Email notifications (via Resend)
 * - PagerDuty
 * - Custom webhooks
 * 
 * SAFE GOLD: No external notifications are sent until explicitly enabled.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlertPayload {
  event_id: string;
  event_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  tenant_id?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("notify-critical-alert", correlationId);

  try {
    // Validate service role (internal only)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.includes('service_role')) {
      log.warn('[notify-critical-alert] Unauthorized attempt without service role');
      return new Response(
        JSON.stringify({ error: 'SERVICE_ROLE_REQUIRED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: AlertPayload = await req.json();

    // Validate payload
    if (!payload.event_id || !payload.event_type || !payload.severity) {
      return new Response(
        JSON.stringify({ 
          error: 'INVALID_PAYLOAD',
          required: ['event_id', 'event_type', 'severity'],
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate severity
    const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    if (!validSeverities.includes(payload.severity)) {
      return new Response(
        JSON.stringify({ 
          error: 'INVALID_SEVERITY',
          valid: validSeverities,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STUB: Log to webhook_events for now (external integrations OFF)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: insertError } = await supabase.from('webhook_events').insert({
      event_type: 'ALERT_NOTIFICATION_STUB',
      payload: {
        ...payload,
        _stub_note: 'External notifications OFF. Enable via SLACK_WEBHOOK_URL or ALERT_EMAIL_ENABLED.',
      },
      status: 'LOGGED',
    });

    if (insertError) {
      log.error('[notify-critical-alert] Failed to log event:', insertError);
      // Don't fail the request, just log
    }

    // Check for Slack webhook (future integration)
    const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    if (slackWebhookUrl) {
      // TODO: Implement Slack notification
      log.info('[notify-critical-alert] Slack webhook configured but not yet implemented');
    }

    // Send critical alert email
    const emailEnabled = Deno.env.get('ALERT_EMAIL_ENABLED') === 'true';
    if (emailEnabled) {
      // Send critical alert email to admin
      try {
        const { getEmailClient, isEmailConfigured, DEFAULT_EMAIL_FROM } = await import("../_shared/emailClient.ts");
        if (isEmailConfigured()) {
          const emailClient = getEmailClient();
          const adminEmail = Deno.env.get("ADMIN_ALERT_EMAIL") || Deno.env.get("SUPABASE_ADMIN_EMAIL");
          if (adminEmail) {
            await emailClient.emails.send({
              from: DEFAULT_EMAIL_FROM,
              to: adminEmail,
              subject: `[TATAME PRO CRITICAL] ${payload.event_type}`,
              html: `
                <h2>Critical Alert: ${payload.event_type}</h2>
                <p><strong>Severity:</strong> ${payload.severity}</p>
                <p><strong>Source:</strong> ${payload.metadata?.source || "unknown"}</p>
                <p><strong>Event ID:</strong> ${payload.event_id}</p>
                <p><strong>Time:</strong> ${payload.timestamp || new Date().toISOString()}</p>
                <hr>
                <p>This is an automated alert from Tatame Pro infrastructure.</p>
              `,
            });
            log.info("[notify-critical-alert] Email sent", { to: adminEmail });
          } else {
            log.info("[notify-critical-alert] No ADMIN_ALERT_EMAIL configured");
          }
        } else {
          log.info("[notify-critical-alert] Email not configured");
        }
      } catch (emailError) {
        log.warn("[notify-critical-alert] Email send failed", {
          error: emailError instanceof Error ? emailError.message : String(emailError),
        });
        // INTENTIONAL: Email failure must not fail the alert function
      }
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        status: 'LOGGED',
        message: 'External notifications are OFF. Event logged for future integration.',
        integrations: {
          slack: !!slackWebhookUrl,
          email: emailEnabled,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    log.error('[notify-critical-alert] Error:', error);
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
