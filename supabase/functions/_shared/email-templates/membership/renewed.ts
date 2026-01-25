/**
 * SAFE GOLD - Membership Renewed Confirmation Email Template
 * Institutional tone - confirms renewal with clear next steps
 */

import { wrapInLayout, createButton, createInfoBox, type EmailLayoutData } from "../base.ts";

export interface MembershipRenewedData extends EmailLayoutData {
  athleteName: string;
  newExpirationDate: string;
  portalUrl: string;
}

export function getMembershipRenewedTemplate(data: MembershipRenewedData): { subject: string; html: string } {
  const { athleteName, tenantName, newExpirationDate, portalUrl } = data;

  const content = `
<h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #18181b; line-height: 1.3;">
  Renovação confirmada
</h1>

<p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
  Olá <strong>${athleteName}</strong>,
</p>

<p style="margin: 0 0 25px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
  Sua renovação de filiação à <strong>${tenantName}</strong> foi processada com sucesso. 
  Seu status de atleta ativo está confirmado para o novo período.
</p>

${createInfoBox(`
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr>
      <td>
        <p style="margin: 0 0 5px; font-size: 14px; color: #166534; font-weight: 600;">
          Válido até
        </p>
        <p style="margin: 0; font-size: 20px; font-weight: 700; color: #15803d;">
          ${newExpirationDate}
        </p>
      </td>
    </tr>
  </table>
`, "#22c55e", "#f0fdf4")}

<p style="margin: 25px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
  Sua carteirinha digital foi atualizada automaticamente com a nova data de validade. 
  Você pode acessá-la a qualquer momento pelo portal do atleta.
</p>

${createButton("Acessar Portal do Atleta", portalUrl)}

<p style="margin: 25px 0 0; font-size: 15px; line-height: 1.6; color: #3f3f46;">
  Atenciosamente,<br>
  <strong>${tenantName}</strong>
</p>
  `.trim();

  return {
    subject: `Renovação confirmada — ${tenantName}`,
    html: wrapInLayout(content, data),
  };
}
