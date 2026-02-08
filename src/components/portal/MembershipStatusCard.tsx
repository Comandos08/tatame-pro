import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Calendar, CreditCard } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { formatDate as formatDateUtil } from "@/lib/i18n/formatters";

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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return formatDateUtil(dateStr, locale);
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

  // Derive SAFE GOLD membership state for instrumentation
  const deriveSafeGoldState = (): 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'NONE' => {
    if (!normalizedStatus) return 'NONE';
    if (normalizedStatus === 'EXPIRED') return 'EXPIRED';
    if (normalizedStatus === 'ACTIVE' || normalizedStatus === 'APPROVED') return 'ACTIVE';
    return 'NONE';
  };

  return (
    <Card
      data-testid="portal-membership-card"
      data-membership-state={deriveSafeGoldState()}
    >
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
