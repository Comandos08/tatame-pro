import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[SEND-ATHLETE-EMAIL] ${step}${detailsStr}`);
};

type EmailType = 
  | "MEMBERSHIP_APPROVED"
  | "NEW_MEMBERSHIP_PENDING"
  | "MEMBERSHIP_REJECTED"
  | "NEW_GRADING"
  | "RENEWAL_REMINDER";

interface AthleteEmailRequest {
  email_type: EmailType;
  membership_id?: string;
  athlete_id?: string;
  grading_id?: string;
  data?: {
    athlete_name?: string;
    athlete_email?: string;
    tenant_name?: string;
    card_url?: string;
    diploma_url?: string;
    level_name?: string;
    rejection_reason?: string;
    admin_emails?: string[];
    end_date?: string;
    days_remaining?: number;
  };
}

const EMAIL_FROM = "TATAME <noreply@tatame.pro>";
const BASE_URL = "https://tatame-pro.lovable.app";

function getMembershipApprovedEmail(data: AthleteEmailRequest["data"]): { subject: string; html: string } {
  return {
    subject: `🥋 Bem-vindo à ${data?.tenant_name || "Federação"}! Sua filiação foi aprovada`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #dc2626; margin: 0;">🥋 TATAME</h1>
          <p style="color: #666; margin-top: 5px;">Plataforma de Gestão Esportiva</p>
        </div>
        
        <h2 style="color: #16a34a;">Parabéns, ${data?.athlete_name || "Atleta"}!</h2>
        
        <p style="line-height: 1.6;">
          Sua filiação à <strong>${data?.tenant_name || "nossa federação"}</strong> foi aprovada com sucesso! 
          Agora você faz parte da nossa comunidade de atletas.
        </p>
        
        <div style="background: #f0fdf4; border: 1px solid #22c55e; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 15px; color: #166534; font-weight: 600;">
            Sua carteirinha digital já está disponível!
          </p>
          <a href="${data?.card_url || BASE_URL}" 
             style="background: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Ver minha carteirinha
          </a>
        </div>
        
        <p style="line-height: 1.6;">
          Com sua filiação ativa, você pode:
        </p>
        <ul style="line-height: 1.8; color: #555;">
          <li>Acessar sua carteirinha digital a qualquer momento</li>
          <li>Participar de competições oficiais</li>
          <li>Receber diplomas de graduação</li>
          <li>Acompanhar seu histórico de graduações</li>
        </ul>
        
        <p style="color: #888; font-size: 12px; text-align: center; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
          TATAME - Plataforma de Gestão para Federações de Esportes de Combate<br>
          <a href="${BASE_URL}" style="color: #dc2626;">tatame-pro.lovable.app</a>
        </p>
      </body>
      </html>
    `,
  };
}

function getNewMembershipPendingEmail(data: AthleteEmailRequest["data"]): { subject: string; html: string } {
  return {
    subject: `📋 Nova filiação aguardando aprovação - ${data?.athlete_name || "Novo atleta"}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #dc2626; margin: 0;">🥋 TATAME</h1>
          <p style="color: #666; margin-top: 5px;">Plataforma de Gestão Esportiva</p>
        </div>
        
        <h2 style="color: #dc2626;">📋 Nova filiação pendente</h2>
        
        <p style="line-height: 1.6;">
          Uma nova solicitação de filiação foi recebida e está aguardando sua aprovação.
        </p>
        
        <div style="background: #fef2f2; border: 1px solid #dc2626; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0; color: #92400e;">
            <strong>Atleta:</strong> ${data?.athlete_name || "Nome não informado"}<br>
            <strong>E-mail:</strong> ${data?.athlete_email || "Não informado"}<br>
            <strong>Federação:</strong> ${data?.tenant_name || "Não informado"}
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${BASE_URL}" 
             style="background: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Revisar filiação
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          Acesse o painel administrativo para visualizar os documentos enviados e aprovar ou rejeitar esta solicitação.
        </p>
        
        <p style="color: #888; font-size: 12px; text-align: center; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
          TATAME - Plataforma de Gestão para Federações de Esportes de Combate<br>
          <a href="${BASE_URL}" style="color: #dc2626;">tatame-pro.lovable.app</a>
        </p>
      </body>
      </html>
    `,
  };
}

function getNewGradingEmail(data: AthleteEmailRequest["data"]): { subject: string; html: string } {
  return {
    subject: `🎖️ Parabéns! Você foi graduado para ${data?.level_name || "nova faixa"}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #dc2626; margin: 0;">🥋 TATAME</h1>
          <p style="color: #666; margin-top: 5px;">Plataforma de Gestão Esportiva</p>
        </div>
        
        <h2 style="color: #7c3aed;">🎖️ Parabéns pela sua graduação!</h2>
        
        <p style="line-height: 1.6;">
          Olá <strong>${data?.athlete_name || "Atleta"}</strong>,
        </p>
        
        <p style="line-height: 1.6;">
          É com grande satisfação que comunicamos sua nova graduação pela <strong>${data?.tenant_name || "federação"}</strong>!
        </p>
        
        <div style="background: #f5f3ff; border: 1px solid #7c3aed; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 10px; color: #5b21b6; font-size: 14px;">Nova Graduação</p>
          <p style="margin: 0; color: #5b21b6; font-size: 24px; font-weight: 700;">
            ${data?.level_name || "Nova Faixa"}
          </p>
        </div>
        
        ${data?.diploma_url ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.diploma_url}" 
             style="background: #7c3aed; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Ver meu diploma
          </a>
        </div>
        ` : `
        <p style="line-height: 1.6; color: #666;">
          Seu diploma será gerado em breve e estará disponível na sua área do atleta.
        </p>
        `}
        
        <p style="line-height: 1.6;">
          Continue treinando com dedicação e disciplina. Cada graduação é um marco importante na sua jornada!
        </p>
        
        <p style="color: #888; font-size: 12px; text-align: center; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
          TATAME - Plataforma de Gestão para Federações de Esportes de Combate<br>
          <a href="${BASE_URL}" style="color: #dc2626;">tatame-pro.lovable.app</a>
        </p>
      </body>
      </html>
    `,
  };
}

function getRenewalReminderEmail(data: AthleteEmailRequest["data"]): { subject: string; html: string } {
  const daysText = data?.days_remaining === 1 ? "1 dia" : `${data?.days_remaining || 7} dias`;
  const urgencyColor = (data?.days_remaining || 7) <= 3 ? "#ef4444" : "#f59e0b";
  
  return {
    subject: `⏰ Sua filiação vence em ${daysText} - ${data?.tenant_name || "Federação"}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #dc2626; margin: 0;">🥋 TATAME</h1>
          <p style="color: #666; margin-top: 5px;">Plataforma de Gestão Esportiva</p>
        </div>
        
        <h2 style="color: ${urgencyColor};">⏰ Sua filiação está prestes a vencer!</h2>
        
        <p style="line-height: 1.6;">
          Olá <strong>${data?.athlete_name || "Atleta"}</strong>,
        </p>
        
        <p style="line-height: 1.6;">
          Sua filiação à <strong>${data?.tenant_name || "federação"}</strong> vence em <strong>${daysText}</strong> 
          (${data?.end_date || "em breve"}).
        </p>
        
        <div style="background: #fef3c7; border: 1px solid ${urgencyColor}; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0; color: #92400e; font-weight: 600;">
            Renove agora para não perder seu status de atleta ativo e continuar participando de competições!
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${BASE_URL}" 
             style="background: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Renovar minha filiação
          </a>
        </div>
        
        <p style="line-height: 1.6; color: #666;">
          Após o vencimento, sua carteirinha digital será desativada e você não poderá participar de eventos oficiais até regularizar sua situação.
        </p>
        
        <p style="color: #888; font-size: 12px; text-align: center; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
          TATAME - Plataforma de Gestão para Federações de Esportes de Combate<br>
          <a href="${BASE_URL}" style="color: #dc2626;">tatame-pro.lovable.app</a>
        </p>
      </body>
      </html>
    `,
  };
}

function getEmailContent(emailType: EmailType, data: AthleteEmailRequest["data"]): { subject: string; html: string } {
  switch (emailType) {
    case "MEMBERSHIP_APPROVED":
      return getMembershipApprovedEmail(data);
    case "NEW_MEMBERSHIP_PENDING":
      return getNewMembershipPendingEmail(data);
    case "NEW_GRADING":
      return getNewGradingEmail(data);
    case "RENEWAL_REMINDER":
      return getRenewalReminderEmail(data);
    default:
      throw new Error(`Unknown email_type: ${emailType}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      logStep("RESEND_API_KEY not configured, skipping email");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "RESEND_API_KEY not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const resend = new Resend(resendApiKey);
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const request: AthleteEmailRequest = await req.json();
    const { email_type, membership_id, data } = request;
    
    logStep("Received request", { email_type, membership_id });

    if (!email_type) {
      throw new Error("Missing email_type");
    }

    let recipients: string[] = [];
    let emailData = { ...data };

    // If membership_id provided, fetch additional data
    if (membership_id) {
      const { data: membership, error: membershipError } = await supabase
        .from("memberships")
        .select(`
          id,
          athlete:athletes(id, full_name, email),
          tenant:tenants(id, name, billing_email),
          digital_cards(id, pdf_url)
        `)
        .eq("id", membership_id)
        .single();

      if (membershipError || !membership) {
        throw new Error(`Membership not found: ${membership_id}`);
      }

      const athlete = membership.athlete as unknown as { id: string; full_name: string; email: string } | null;
      const tenant = membership.tenant as unknown as { id: string; name: string; billing_email: string | null } | null;
      const digitalCard = (membership.digital_cards as { id: string; pdf_url: string | null }[])?.[0];

      emailData.athlete_name = athlete?.full_name || emailData.athlete_name;
      emailData.athlete_email = athlete?.email || emailData.athlete_email;
      emailData.tenant_name = tenant?.name || emailData.tenant_name;
      emailData.card_url = digitalCard?.pdf_url || `${BASE_URL}/athlete`;

      // Determine recipients based on email type
      if (email_type === "MEMBERSHIP_APPROVED" && athlete?.email) {
        recipients.push(athlete.email);
      } else if (email_type === "NEW_MEMBERSHIP_PENDING" && tenant?.id) {
        // Get admin emails for the tenant
        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("tenant_id", tenant.id)
          .in("role", ["ADMIN_TENANT", "STAFF_ORGANIZACAO"]);

        if (adminRoles && adminRoles.length > 0) {
          const adminUserIds = adminRoles.map((r) => r.user_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("email")
            .in("id", adminUserIds);

          recipients = (profiles || []).map((p) => p.email).filter(Boolean);
        }

        // Also add billing email if available
        if (tenant.billing_email) {
          recipients.push(tenant.billing_email);
        }
      }
    }

    // Use provided recipients if any
    if (data?.admin_emails && data.admin_emails.length > 0) {
      recipients = [...recipients, ...data.admin_emails];
    }

    // Use athlete email directly if provided
    if (email_type === "MEMBERSHIP_APPROVED" && data?.athlete_email) {
      recipients.push(data.athlete_email);
    }

    // Remove duplicates
    recipients = [...new Set(recipients)];

    if (recipients.length === 0) {
      logStep("No recipients found, skipping email");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "No recipients" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    logStep("Sending email", { recipients, email_type });

    const { subject, html } = getEmailContent(email_type, emailData);

    const { error: emailError } = await resend.emails.send({
      from: EMAIL_FROM,
      to: recipients,
      subject,
      html,
    });

    if (emailError) {
      throw new Error(`Resend error: ${JSON.stringify(emailError)}`);
    }

    logStep("Email sent successfully", { recipients, email_type });

    return new Response(
      JSON.stringify({ success: true, recipients, email_type }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("Error sending email", { error: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
