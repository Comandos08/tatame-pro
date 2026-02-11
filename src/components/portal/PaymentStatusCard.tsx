
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Wallet, CheckCircle, Clock, XCircle, AlertTriangle } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";

import { isValidStatusType, getStatusI18nKey } from "@/lib/statusUtils";

interface PaymentStatusCardProps {
  paymentStatus: string;
}

export function PaymentStatusCard({ paymentStatus }: PaymentStatusCardProps) {
  const { t } = useI18n();

  const normalizedStatus = paymentStatus?.toUpperCase() ?? null;

  /* ---------------- Icon mapping ---------------- */

  const getStatusIcon = () => {
    switch (normalizedStatus) {
      case "PAID":
        return <CheckCircle className="h-5 w-5 text-success" />;
      case "PENDING":
      case "PENDING_PAYMENT":
        return <Clock className="h-5 w-5 text-warning" />;
      case "NOT_PAID":
        return <AlertTriangle className="h-5 w-5 text-warning" />;
      case "FAILED":
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  /* ---------------- Badge rendering ---------------- */

  const renderStatusBadge = () => {
    if (!isValidStatusType(normalizedStatus)) {
      return <StatusBadge status="neutral" label={paymentStatus || "-"} />;
    }

    return <StatusBadge status={normalizedStatus} label={t(getStatusI18nKey(normalizedStatus))} />;
  };

  /* ---------------- Render ---------------- */

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wallet className="h-5 w-5 text-primary" />
          {t("portal.paymentStatus")}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="text-sm text-muted-foreground">{t("portal.payment.status")}</span>
          </div>

          {renderStatusBadge()}
        </div>
      </CardContent>
    </Card>
  );
}
