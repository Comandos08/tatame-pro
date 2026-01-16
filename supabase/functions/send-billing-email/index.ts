import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[SEND-BILLING-EMAIL] ${step}${detailsStr}`);
};

interface BillingEmailRequest {
  event_type: 
    | "TRIAL_STARTED" 
    | "TRIAL_ENDING_SOON"
    | "INVOICE_PAYMENT_SUCCEEDED" 
    | "PAYMENT_FAILED" 
    | "TENANT_WILL_BE_BLOCKED"
    | "TENANT_BLOCKED";
  tenant_id: string;
  data?: {
    trial_end_date?: string;
    invoice_amount?: number;
    invoice_currency?: string;
    invoice_url?: string;
    period_end?: string;
  };
}

const emailTemplates: Record<string, { subject: string; getHtml: (tenantName: string, data?: BillingEmailRequest["data"]) => string }> = {
  TRIAL_STARTED: {
    subject: "Bem-vindo ao IPPON - Seu período de teste começou!",
    getHtml: (tenantName, data) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #dc2626; margin: 0;">IPPON</h1>
          <p style="color: #666; margin-top: 5px;">Plataforma de Gestão Esportiva</p>
        </div>
        
        <h2 style="color: #333;">Bem-vindo, ${tenantName}! 🥋</h2>
        
        <p style="color: #555; line-height: 1.6;">
          Seu período de teste gratuito começou! Você tem acesso completo a todas as funcionalidades 
          da plataforma IPPON até <strong>${data?.trial_end_date || "o final do período de teste"}</strong>.
        </p>
        
        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">O que você pode fazer:</h3>
          <ul style="color: #555; line-height: 1.8;">
            <li>Cadastrar atletas e filiações</li>
            <li>Gerenciar academias e treinadores</li>
            <li>Emitir carteirinhas digitais e diplomas</li>
            <li>Acompanhar rankings e graduações</li>
          </ul>
        </div>
        
        <p style="color: #555; line-height: 1.6;">
          Para garantir que seu acesso não seja interrompido, recomendamos configurar 
          seu método de pagamento antes do final do período de teste.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://tatame-pro.lovable.app" 
             style="background: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Acessar minha organização
          </a>
        </div>
        
        <p style="color: #888; font-size: 12px; text-align: center; margin-top: 40px;">
          IPPON - Plataforma de Gestão para Federações de Esportes de Combate
        </p>
      </div>
    `,
  },
  TRIAL_ENDING_SOON: {
    subject: "⏰ Seu período de teste termina em 3 dias - IPPON",
    getHtml: (tenantName, data) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #dc2626; margin: 0;">IPPON</h1>
          <p style="color: #666; margin-top: 5px;">Plataforma de Gestão Esportiva</p>
        </div>
        
        <h2 style="color: #f59e0b;">⏰ Seu período de teste está terminando!</h2>
        
        <p style="color: #555; line-height: 1.6;">
          Olá ${tenantName}, seu período de teste gratuito termina em <strong>${data?.trial_end_date || "3 dias"}</strong>.
        </p>
        
        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0; color: #92400e; font-weight: 600;">
            Configure seu método de pagamento agora para não perder o acesso!
          </p>
        </div>
        
        <p style="color: #555; line-height: 1.6;">
          Após o término do período de teste, sua organização não poderá mais acessar as funcionalidades 
          da plataforma até que o pagamento seja regularizado.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://tatame-pro.lovable.app" 
             style="background: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Configurar pagamento
          </a>
        </div>
        
        <p style="color: #888; font-size: 12px; text-align: center; margin-top: 40px;">
          IPPON - Plataforma de Gestão para Federações de Esportes de Combate
        </p>
      </div>
    `,
  },
  INVOICE_PAYMENT_SUCCEEDED: {
    subject: "Pagamento confirmado - IPPON",
    getHtml: (tenantName, data) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #dc2626; margin: 0;">IPPON</h1>
        </div>
        
        <h2 style="color: #333;">Pagamento confirmado! ✅</h2>
        
        <p style="color: #555; line-height: 1.6;">
          Olá ${tenantName}, seu pagamento foi processado com sucesso.
        </p>
        
        <div style="background: #f0fdf4; border: 1px solid #22c55e; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0; color: #166534;">
            <strong>Valor:</strong> ${data?.invoice_currency?.toUpperCase() || "BRL"} ${((data?.invoice_amount || 0) / 100).toFixed(2)}<br>
            <strong>Próxima renovação:</strong> ${data?.period_end || "Em 1 ano"}
          </p>
        </div>
        
        ${data?.invoice_url ? `
          <p style="color: #555;">
            <a href="${data.invoice_url}" style="color: #dc2626;">Ver recibo completo</a>
          </p>
        ` : ""}
        
        <p style="color: #555; line-height: 1.6;">
          Obrigado por confiar na plataforma IPPON!
        </p>
        
        <p style="color: #888; font-size: 12px; text-align: center; margin-top: 40px;">
          IPPON - Plataforma de Gestão para Federações de Esportes de Combate
        </p>
      </div>
    `,
  },
  PAYMENT_FAILED: {
    subject: "⚠️ Problema com seu pagamento - IPPON",
    getHtml: (tenantName) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #dc2626; margin: 0;">IPPON</h1>
        </div>
        
        <h2 style="color: #ef4444;">Problema com seu pagamento</h2>
        
        <p style="color: #555; line-height: 1.6;">
          Olá ${tenantName}, não foi possível processar seu pagamento.
        </p>
        
        <div style="background: #fef2f2; border: 1px solid #ef4444; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0; color: #991b1b;">
            Por favor, atualize seu método de pagamento para evitar a suspensão do serviço.
          </p>
        </div>
        
        <p style="color: #555; line-height: 1.6;">
          Você pode atualizar seu método de pagamento acessando o portal de gerenciamento 
          de assinatura no painel administrativo.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://tatame-pro.lovable.app" 
             style="background: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Atualizar pagamento
          </a>
        </div>
        
        <p style="color: #888; font-size: 12px; text-align: center; margin-top: 40px;">
          IPPON - Plataforma de Gestão para Federações de Esportes de Combate
        </p>
      </div>
    `,
  },
  TENANT_WILL_BE_BLOCKED: {
    subject: "🚨 Ação necessária: Sua assinatura será suspensa - IPPON",
    getHtml: (tenantName) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #dc2626; margin: 0;">IPPON</h1>
        </div>
        
        <h2 style="color: #ef4444;">⚠️ Atenção: Suspensão iminente</h2>
        
        <p style="color: #555; line-height: 1.6;">
          Olá ${tenantName}, sua assinatura está prestes a ser suspensa por falta de pagamento.
        </p>
        
        <div style="background: #fef2f2; border: 1px solid #ef4444; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0; color: #991b1b; font-weight: 600;">
            Se o pagamento não for regularizado em breve, o acesso ao sistema será bloqueado.
          </p>
        </div>
        
        <p style="color: #555; line-height: 1.6;">
          Para evitar a interrupção do serviço, por favor regularize seu pagamento imediatamente.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://tatame-pro.lovable.app" 
             style="background: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Regularizar agora
          </a>
        </div>
        
        <p style="color: #888; font-size: 12px; text-align: center; margin-top: 40px;">
          IPPON - Plataforma de Gestão para Federações de Esportes de Combate
        </p>
      </div>
    `,
  },
  TENANT_BLOCKED: {
    subject: "🔒 Acesso suspenso - IPPON",
    getHtml: (tenantName) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #dc2626; margin: 0;">IPPON</h1>
        </div>
        
        <h2 style="color: #ef4444;">Acesso suspenso</h2>
        
        <p style="color: #555; line-height: 1.6;">
          Olá ${tenantName}, infelizmente seu acesso ao IPPON foi suspenso devido a pendências no pagamento.
        </p>
        
        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0; color: #555;">
            Para reativar seu acesso, entre em contato com nosso suporte ou 
            regularize o pagamento através do portal de gerenciamento.
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="mailto:suporte@tatamepro.com.br" 
             style="background: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Contatar suporte
          </a>
        </div>
        
        <p style="color: #888; font-size: 12px; text-align: center; margin-top: 40px;">
          IPPON - Plataforma de Gestão para Federações de Esportes de Combate
        </p>
      </div>
    `,
  },
};

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { event_type, tenant_id, data }: BillingEmailRequest = await req.json();
    logStep("Received request", { event_type, tenant_id });

    if (!event_type || !tenant_id) {
      throw new Error("Missing event_type or tenant_id");
    }

    // Get tenant info
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, billing_email")
      .eq("id", tenant_id)
      .single();

    if (tenantError || !tenant) {
      throw new Error(`Tenant not found: ${tenant_id}`);
    }

    // Get admin emails as fallback
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("tenant_id", tenant_id)
      .eq("role", "ADMIN_TENANT");

    const adminUserIds = (adminRoles || []).map((r) => r.user_id);
    
    let adminEmails: string[] = [];
    if (adminUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("email")
        .in("id", adminUserIds);
      
      adminEmails = (profiles || []).map((p) => p.email).filter(Boolean);
    }

    // Determine recipients
    const recipients: string[] = [];
    if (tenant.billing_email) {
      recipients.push(tenant.billing_email);
    }
    recipients.push(...adminEmails);

    // Remove duplicates
    const uniqueRecipients = [...new Set(recipients)];

    if (uniqueRecipients.length === 0) {
      logStep("No recipients found, skipping email");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "No recipients" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    logStep("Sending email", { recipients: uniqueRecipients, event_type });

    const template = emailTemplates[event_type];
    if (!template) {
      throw new Error(`Unknown event_type: ${event_type}`);
    }

    // Use Resend API directly via fetch
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "IPPON <noreply@tatame.pro>",
        to: uniqueRecipients,
        subject: template.subject,
        html: template.getHtml(tenant.name, data),
      }),
    });

    const emailResult = await emailResponse.json();
    
    if (!emailResponse.ok) {
      throw new Error(`Resend API error: ${JSON.stringify(emailResult)}`);
    }

    logStep("Email sent successfully", { response: emailResult });

    return new Response(
      JSON.stringify({ success: true, emailResponse: emailResult }),
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
