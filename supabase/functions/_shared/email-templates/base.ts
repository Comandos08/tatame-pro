/**
 * SAFE GOLD - Email Template Base Layout
 * Institutional design for transactional emails
 * No marketing, no aggressive CTAs - sober and trustworthy
 */

export interface EmailLayoutData {
  tenantName: string;
  tenantLogoUrl?: string | null;
  primaryColor?: string;
}

/**
 * Base email layout with institutional header and footer
 * Mobile-first responsive design
 */
export function wrapInLayout(
  content: string,
  data: EmailLayoutData
): string {
  const { tenantName, tenantLogoUrl, primaryColor = "#dc2626" } = data;

  const logoSection = tenantLogoUrl
    ? `<img src="${tenantLogoUrl}" alt="${tenantName}" style="max-height: 60px; max-width: 200px;" />`
    : `<span style="font-size: 24px; font-weight: 700; color: ${primaryColor};">🥋 ${tenantName}</span>`;

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${tenantName}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 10px !important; }
      .content { padding: 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  
  <!-- Wrapper -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        
        <!-- Container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px;" class="container">
          
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 30px 40px; background-color: #ffffff; border-radius: 12px 12px 0 0; border-bottom: 1px solid #e4e4e7;">
              ${logoSection}
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td class="content" style="padding: 40px; background-color: #ffffff;">
              ${content}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #fafafa; border-radius: 0 0 12px 12px; border-top: 1px solid #e4e4e7;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding-bottom: 15px;">
                    <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #71717a;">
                      <strong>${tenantName}</strong><br>
                      Federação de Esportes de Combate
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #a1a1aa;">
                      Este é um e-mail automático. Por favor, não responda diretamente.<br>
                      Em caso de dúvidas, entre em contato através dos canais oficiais.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
        </table>
        
      </td>
    </tr>
  </table>
  
</body>
</html>
  `.trim();
}

/**
 * Creates a primary action button with institutional styling
 */
export function createButton(text: string, url: string, color = "#dc2626"): string {
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
  <tr>
    <td align="center" style="padding: 25px 0;">
      <a href="${url}" 
         style="display: inline-block; background-color: ${color}; color: #ffffff; padding: 14px 32px; 
                text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;
                mso-padding-alt: 0; text-align: center;">
        <!--[if mso]>
        <i style="letter-spacing: 32px; mso-font-width: -100%; mso-text-raise: 30pt;">&nbsp;</i>
        <![endif]-->
        <span style="mso-text-raise: 15pt;">${text}</span>
        <!--[if mso]>
        <i style="letter-spacing: 32px; mso-font-width: -100%;">&nbsp;</i>
        <![endif]-->
      </a>
    </td>
  </tr>
</table>
  `.trim();
}

/**
 * Creates an info box for highlighting important information
 */
export function createInfoBox(content: string, borderColor = "#dc2626", bgColor = "#fef2f2"): string {
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
  <tr>
    <td style="padding: 20px; background-color: ${bgColor}; border-left: 4px solid ${borderColor}; border-radius: 4px;">
      ${content}
    </td>
  </tr>
</table>
  `.trim();
}
