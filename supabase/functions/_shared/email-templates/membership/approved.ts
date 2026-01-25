/**
 * SAFE GOLD - Membership Approved Email Template
 * Institutional tone - celebrates approval without being overly promotional
 */

import { wrapInLayout, createButton, createInfoBox, type EmailLayoutData } from "../base.ts";

export interface MembershipApprovedData extends EmailLayoutData {
  athleteName: string;
  cardUrl?: string;
  portalUrl: string;
}

export function getMembershipApprovedTemplate(data: MembershipApprovedData): { subject: string; html: string } {
  const { athleteName, tenantName, cardUrl, portalUrl } = data;

  const content = `
<h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #18181b; line-height: 1.3;">
  Sua filiação foi aprovada
</h1>

<p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
  Olá <strong>${athleteName}</strong>,
</p>

<p style="margin: 0 0 25px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
  É com satisfação que comunicamos: sua filiação à <strong>${tenantName}</strong> foi analisada e aprovada. 
  A partir de agora, você faz parte oficialmente da nossa comunidade de atletas.
</p>

${createInfoBox(`
  <p style="margin: 0; font-size: 15px; line-height: 1.5; color: #166534;">
    <strong>✓ Carteirinha digital disponível</strong><br>
    Sua credencial já pode ser acessada a qualquer momento pelo portal do atleta.
  </p>
`, "#22c55e", "#f0fdf4")}

<p style="margin: 25px 0; font-size: 16px; line-height: 1.6; color: #3f3f46;">
  Com sua filiação ativa, você pode:
</p>

<ul style="margin: 0 0 25px; padding-left: 20px; font-size: 15px; line-height: 1.8; color: #52525b;">
  <li>Acessar sua carteirinha digital com QR Code de verificação</li>
  <li>Participar de competições e eventos oficiais</li>
  <li>Receber diplomas de graduação registrados</li>
  <li>Acompanhar seu histórico completo de graduações</li>
</ul>

${createButton("Acessar Portal do Atleta", cardUrl || portalUrl)}

<p style="margin: 20px 0 0; font-size: 14px; line-height: 1.5; color: #71717a; text-align: center;">
  Guarde bem suas credenciais de acesso.
</p>
  `.trim();

  return {
    subject: `Filiação aprovada — ${tenantName}`,
    html: wrapInLayout(content, data),
  };
}
