/**
 * SAFE GOLD - Membership Rejected Email Template
 * Institutional tone - respectful communication with clear reason
 */

import { wrapInLayout, createButton, createInfoBox, type EmailLayoutData } from "../base.ts";

export interface MembershipRejectedData extends EmailLayoutData {
  athleteName: string;
  rejectionReason?: string;
  supportEmail?: string;
  reapplyUrl?: string;
}

export function getMembershipRejectedTemplate(data: MembershipRejectedData): { subject: string; html: string } {
  const { athleteName, tenantName, rejectionReason, supportEmail, reapplyUrl } = data;

  const reasonSection = rejectionReason 
    ? createInfoBox(`
        <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #92400e;">
          Motivo informado:
        </p>
        <p style="margin: 0; font-size: 15px; line-height: 1.5; color: #78350f;">
          ${rejectionReason}
        </p>
      `, "#f59e0b", "#fefce8")
    : "";

  const content = `
<h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #18181b; line-height: 1.3;">
  Sua solicitação não foi aprovada
</h1>

<p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
  Olá <strong>${athleteName}</strong>,
</p>

<p style="margin: 0 0 25px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
  Após análise da documentação enviada, informamos que sua solicitação de filiação 
  à <strong>${tenantName}</strong> não pôde ser aprovada neste momento.
</p>

${reasonSection}

<p style="margin: 25px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
  Caso tenha dúvidas sobre esta decisão ou deseje enviar documentação complementar, 
  entre em contato através dos canais oficiais${supportEmail ? ` ou pelo e-mail <strong>${supportEmail}</strong>` : ""}.
</p>

${reapplyUrl ? createButton("Iniciar Nova Solicitação", reapplyUrl, "#52525b") : ""}

<p style="margin: 20px 0 0; font-size: 14px; line-height: 1.5; color: #71717a;">
  Agradecemos seu interesse e permanecemos à disposição.
</p>
  `.trim();

  return {
    subject: `Solicitação de filiação — ${tenantName}`,
    html: wrapInLayout(content, data),
  };
}
