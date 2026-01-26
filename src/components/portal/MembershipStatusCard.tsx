import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Calendar, CreditCard } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { format } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";

import { isValidStatusType, getStatusI18nKey } from "@/lib/statusUtils";

interface MembershipStatusCardProps {
  status: string;
  type: string;
  startDate: string | null;
  endDate: string | null;
}

export function MembershipStatusCard({ status, type, startDate, endDate }: MembershipStatusCardProps) {
  const { t, locale } = useI18n();

  /* ---------------- Locale helpers ---------------- */

  const getDateLocale = () => {
    switch (locale) {
      case "en":
        return enUS;
      case "es":
        return es;
      default:
        return ptBR;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "dd MMM yyyy", {
        locale: getDateLocale(),
      });
    } catch {
      return dateStr;
    }
  };

  /* ---------------- Status helpers ---------------- */

  const normalizedStatus = status?.toUpperCase() ?? null;

  const renderStatusBadge = () => {
    if (!isValidStatusType(normalizedStatus)) {
      return <StatusBadge status="neutral" label={status} />;
    }

    return <StatusBadge status={normalizedStatus} label={t(getStatusI18nKey(normalizedStatus))} />;
  };

  const getMembershipTypeLabel = () => {
    switch (type) {
      case "FIRST_MEMBERSHIP":
        return t("membership.type.first");
      case "RENEWAL":
        return t("membership.type.renewal");
      default:
        return type;
    }
  };

  /* ---------------- Render ---------------- */

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5 text-primary" />
          {t("portal.membershipStatus")}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("portal.membership.status")}</span>
          {renderStatusBadge()}
        </div>

        {/* Type */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("portal.membership.type")}</span>
          <StatusBadge status="neutral" size="sm" label={getMembershipTypeLabel()} />
        </div>

        {/* Dates */}
        <div className="border-t pt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t("portal.membership.start")}:</span>
            <span className="font-medium">{formatDate(startDate)}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t("portal.membership.end")}:</span>
            <span className="font-medium">{formatDate(endDate)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
