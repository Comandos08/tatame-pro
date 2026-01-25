/**
 * SAFE GOLD - Membership Expiring Warning Email Template
 * Institutional tone - clear urgency without aggressive marketing
 */

import { wrapInLayout, createButton, createInfoBox, type EmailLayoutData } from "../base.ts";

export interface MembershipExpiringData extends EmailLayoutData {
  athleteName: string;
  daysRemaining: number;
  expirationDate: string;
  renewUrl: string;
}

export function getMembershipExpiringTemplate(data: MembershipExpiringData): { subject: string; html: string } {
  const { athleteName, tenantName, daysRemaining, expirationDate, renewUrl } = data;

  const daysText = daysRemaining === 1 ? "1 dia" : `${daysRemaining} dias`;
  const isUrgent = daysRemaining <= 3;
  
  const urgencyColor = isUrgent ? "#dc2626" : "#f59e0b";
  const urgencyBg = isUrgent ? "#fef2f2" : "#fefce8";

  const content = `
<h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #18181b; line-height: 1.3;">
  Sua filiação vence em ${daysText}
</h1>

<p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
  Olá <strong>${athleteName}</strong>,
</p>

<p style="margin: 0 0 25px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
  Sua filiação à <strong>${tenantName}</strong> está próxima do vencimento. 
  Para manter seu status de atleta ativo e continuar participando de eventos oficiais, 
  é necessário renovar antes da data limite.
</p>

${createInfoBox(`
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr>
      <td>
        <p style="margin: 0 0 5px; font-size: 14px; color: ${isUrgent ? '#991b1b' : '#92400e'}; font-weight: 600;">
          Data de vencimento
        </p>
        <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${isUrgent ? '#dc2626' : '#b45309'};">
          ${expirationDate}
        </p>
      </td>
    </tr>
  </table>
`, urgencyColor, urgencyBg)}

<p style="margin: 25px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
  Após o vencimento:
</p>

<ul style="margin: 0 0 25px; padding-left: 20px; font-size: 15px; line-height: 1.8; color: #52525b;">
  <li>Sua carteirinha digital será desativada</li>
  <li>Participação em eventos oficiais ficará suspensa</li>
  <li>Será necessário novo processo de regularização</li>
</ul>

${createButton("Renovar Filiação", renewUrl, urgencyColor)}

<p style="margin: 20px 0 0; font-size: 14px; line-height: 1.5; color: #71717a; text-align: center;">
  Renove com antecedência e evite interrupções.
</p>
  `.trim();

  const urgencyPrefix = isUrgent ? "⚠️ " : "";

  return {
    subject: `${urgencyPrefix}Sua filiação vence em ${daysText} — ${tenantName}`,
    html: wrapInLayout(content, data),
  };
}
