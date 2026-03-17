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
 *
 * Internal-only endpoint for external alert notifications.
 * Requires explicit shared-secret authentication.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";

interface AlertPayload {
  event_id: string;
  event_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  tenant_id?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

function extractInternalSecret(req: Request): string {
  return req.headers.get('x-internal-alert-secret')?.trim() || '';
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("notify-critical-alert", correlationId);
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  try {
    // Validate service role (internal only)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.includes('service_role')) {
      log.warn('[notify-critical-alert] Unauthorized attempt without service role');
    const expectedSecret = Deno.env.get('INTERNAL_ALERT_SECRET')?.trim() || '';
    const providedSecret = extractInternalSecret(req);

    if (!expectedSecret || providedSecret !== expectedSecret) {
      log.warn('[notify-critical-alert] Unauthorized attempt with invalid internal secret');
      return new Response(
        JSON.stringify({ error: 'SERVICE_ROLE_REQUIRED' }),
        { status: 401, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
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
        { status: 400, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
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
        { status: 400, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
      );
    }

    // STUB: Log to webhook_events for now (external integrations OFF)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Insert into institutional_events (primary audit)
    const { error: ieError } = await supabase.from('institutional_events').insert({
      type: payload.event_type,
      domain: 'ALERT',
      tenant_id: payload.tenant_id || null,
      metadata: {
        severity: payload.severity,
        source: 'notify-critical-alert',
        event_id: payload.event_id,
        timestamp: payload.timestamp,
        ...(payload.metadata || {}),
      },
    });

    if (ieError) {
      log.error('[notify-critical-alert] Failed to insert institutional_events:', { error: ieError.message });
    } else {
      log.info('[notify-critical-alert] institutional_events recorded');
    }

    // Insert into webhook_events (secondary log)
    const { error: weError } = await supabase.from('webhook_events').insert({
      event_id: payload.event_id,
      event_type: 'ALERT_NOTIFICATION_STUB',
      payload: {
        ...payload,
        _stub_note: 'External notifications OFF. Enable via SLACK_WEBHOOK_URL or ALERT_EMAIL_ENABLED.',
      },
      status: 'LOGGED',
    });

    if (weError) {
      log.error('[notify-critical-alert] Failed to log webhook_events:', { error: weError.message });
    }

    // Slack webhook integration (P2-46)
    const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    if (slackWebhookUrl) {
      try {
        const severityEmoji: Record<string, string> = {
          LOW: ':information_source:',
          MEDIUM: ':warning:',
          HIGH: ':rotating_light:',
          CRITICAL: ':fire:',
        };
        const slackPayload = {
          text: `${severityEmoji[payload.severity] || ':bell:'} *[${payload.severity}] ${payload.event_type}*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: [
                  `${severityEmoji[payload.severity] || ':bell:'} *[${payload.severity}] ${payload.event_type}*`,
                  `*Event ID:* \`${payload.event_id}\``,
                  payload.tenant_id ? `*Tenant:* \`${payload.tenant_id}\`` : '',
                  `*Time:* ${payload.timestamp || new Date().toISOString()}`,
                  payload.metadata?.source ? `*Source:* ${String(payload.metadata.source)}` : '',
                ].filter(Boolean).join('\n'),
              },
            },
          ],
        };

        const slackResponse = await fetch(slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slackPayload),
        });

        if (slackResponse.ok) {
          log.info('[notify-critical-alert] Slack notification sent');
        } else {
          log.warn('[notify-critical-alert] Slack webhook failed', { status: slackResponse.status });
        }
      } catch (slackError) {
        log.warn('[notify-critical-alert] Slack notification failed', {
          error: slackError instanceof Error ? slackError.message : String(slackError),
        });
        // INTENTIONAL: Slack failure must not fail the alert function
      }
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
        message: 'Alert processed. Check integrations for delivery status.',
        integrations: {
          slack: !!slackWebhookUrl,
          email: emailEnabled,
        },
      }),
      { status: 200, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    log.error('[notify-critical-alert] Error:', error);
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...dynamicCors, 'Content-Type': 'application/json' } }
    );
  }
});
