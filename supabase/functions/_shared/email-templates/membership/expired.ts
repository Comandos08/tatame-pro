/**
 * SAFE GOLD - Membership Expired Email Template
 * Institutional tone - clear information that membership has expired
 * Used by expire-memberships cron job (ACTIVE → EXPIRED)
 */

import { wrapInLayout, createButton, createInfoBox, type EmailLayoutData } from "../base.ts";

export interface MembershipExpiredData extends EmailLayoutData {
  athleteName: string;
  expirationDate: string;
  renewUrl: string;
}

export function getMembershipExpiredTemplate(data: MembershipExpiredData): { subject: string; html: string } {
  const { athleteName, tenantName, expirationDate, renewUrl } = data;

  const content = `
<h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #18181b; line-height: 1.3;">
  Sua filiação expirou
</h1>

<p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
  Olá <strong>${athleteName}</strong>,
</p>

<p style="margin: 0 0 25px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
  Informamos que sua filiação à <strong>${tenantName}</strong> expirou. 
  Para voltar a participar de eventos oficiais e manter seu status de atleta ativo, 
  é necessário renovar sua filiação.
</p>

${createInfoBox(`
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr>
      <td>
        <p style="margin: 0 0 5px; font-size: 14px; color: #991b1b; font-weight: 600;">
          Data de expiração
        </p>
        <p style="margin: 0; font-size: 20px; font-weight: 700; color: #dc2626;">
          ${expirationDate}
        </p>
      </td>
    </tr>
  </table>
`, "#dc2626", "#fef2f2")}

<p style="margin: 25px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
  Com a filiação expirada:
</p>

<ul style="margin: 0 0 25px; padding-left: 20px; font-size: 15px; line-height: 1.8; color: #52525b;">
  <li>Sua carteirinha digital foi desativada</li>
  <li>Participação em eventos oficiais está suspensa</li>
  <li>Diplomas e graduações permanecem válidos</li>
</ul>

${createButton("Renovar Filiação Agora", renewUrl, "#dc2626")}

<p style="margin: 25px 0 0; font-size: 15px; line-height: 1.6; color: #3f3f46;">
  Atenciosamente,<br>
  <strong>${tenantName}</strong>
</p>
  `.trim();

  return {
    subject: `Sua filiação expirou — ${tenantName}`,
    html: wrapInLayout(content, data),
  };
}
