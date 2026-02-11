import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Award, Download, ExternalLink } from "lucide-react";
import { PortalEmptyState } from "@/components/portal/PortalEmptyState";
import { useI18n } from "@/contexts/I18nContext";
import { formatDate as formatDateUtil } from "@/lib/i18n/formatters";

interface DiplomaData {
  id: string;
  serial_number: string;
  promotion_date: string;
  status: string;
  pdf_url: string | null;
  grading_level_id: string;
}

interface DiplomasListCardProps {
  diplomas: DiplomaData[];
  tenantSlug: string;
}

export function DiplomasListCard({ diplomas, tenantSlug }: DiplomasListCardProps) {
  const { t, locale } = useI18n();

  /* ---------------- Locale helpers ---------------- */

  const formatDate = (dateStr: string) => {
    return formatDateUtil(dateStr, locale);
  };

  /* ---------------- Actions ---------------- */

  const handleDownload = (pdfUrl: string) => {
    window.open(pdfUrl, "_blank");
  };

  const handleVerify = (diplomaId: string) => {
    window.open(`/${tenantSlug}/verify/diploma/${diplomaId}`, "_blank");
  };

  /* ---------------- Empty State (retorno antecipado) ---------------- */

  if (diplomas.length === 0) {
    return (
      <PortalEmptyState
        title={t("portal.noDiplomas")}
        description={t("portal.emptyDiplomas")}
        icon={Award}
      />
    );
  }

  /* ---------------- Normal Render ---------------- */

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Award className="h-5 w-5 text-primary" />
          {t("portal.diplomas")}
          <Badge variant="secondary" className="ml-auto">
            {diplomas.length}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {diplomas.map((diploma) => (
            <div
              key={diploma.id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
            >
              {/* Left */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Award className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{diploma.serial_number}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(diploma.promotion_date)}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1">
                {diploma.pdf_url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={t("portal.downloadDiploma")}
                    onClick={() => handleDownload(diploma.pdf_url!)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={t("portal.verifyDiploma")}
                  onClick={() => handleVerify(diploma.id)}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
