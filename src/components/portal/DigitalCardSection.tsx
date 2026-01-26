import React from "react";
import { Link } from "react-router-dom";
import { CreditCard, ArrowRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DigitalMembershipCard } from "@/components/card/DigitalMembershipCard";
import { useTenant } from "@/contexts/TenantContext";
import { useI18n } from "@/contexts/I18nContext";

interface DigitalCardData {
  id: string;
  qr_code_image_url: string | null;
  pdf_url: string | null;
  valid_until: string | null;
  content_hash_sha256: string | null;
  membership_id: string;
}

interface DigitalCardSectionProps {
  digitalCard: DigitalCardData | null;
  athleteName: string;
  tenantSlug: string;
  showFullCardLink?: boolean;
}

export function DigitalCardSection({
  digitalCard,
  athleteName,
  tenantSlug,
  showFullCardLink = false,
}: DigitalCardSectionProps) {
  const { tenant } = useTenant();
  const { t } = useI18n();

  // Empty / pending state
  if (!digitalCard) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t("portal.digitalCard")}
          </CardTitle>
          <CardDescription>{t("portal.cardNotAvailable")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm">{t("portal.cardPendingGeneration")}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Normal state
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t("portal.digitalCard")}
            </CardTitle>
            <CardDescription>{t("portal.digitalCardDescription")}</CardDescription>
          </div>

          {showFullCardLink && (
            <Link to={`/${tenantSlug}/portal/card`}>
              <Button variant="ghost" size="sm" className="gap-1">
                {t("portal.viewFullCard")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <DigitalMembershipCard
          athleteName={athleteName}
          tenantName={tenant?.name || ""}
          tenantLogo={tenant?.logoUrl}
          tenantSlug={tenantSlug}
          membershipId={digitalCard.membership_id}
          membershipStatus="ACTIVE"
          validUntil={digitalCard.valid_until}
          pdfUrl={digitalCard.pdf_url}
          contentHash={digitalCard.content_hash_sha256}
        />
      </CardContent>
    </Card>
  );
}
