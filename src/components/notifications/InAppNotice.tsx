import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock, CreditCard, XCircle, RefreshCw } from "lucide-react";
import { differenceInDays } from "date-fns";

import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";

interface MembershipData {
  id: string;
  status: string;
  payment_status: string;
  end_date: string | null;
}

interface InAppNoticeProps {
  membership: MembershipData | null | undefined;
  tenantSlug: string;
}

export function InAppNotice({ membership, tenantSlug }: InAppNoticeProps) {
  const { t } = useI18n();

  const notice = useMemo(() => {
    if (!membership) return null;

    const status = membership.status?.toUpperCase();
    const paymentStatus = membership.payment_status?.toUpperCase();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = membership.end_date ? new Date(membership.end_date) : null;
    if (expiry) expiry.setHours(0, 0, 0, 0);

    const daysUntilExpiry = expiry !== null ? differenceInDays(expiry, today) : null;

    // 1️⃣ EXPIRED — prioridade máxima
    if (status === "EXPIRED") {
      return {
        variant: "destructive" as const,
        icon: <XCircle className="h-4 w-4" />,
        title: t("notices.expired"),
        description: t("notices.expiredDesc"),
        action: {
          href: `/${tenantSlug}/membership/renew`,
          label: t("notices.renewNow"),
        },
      };
    }

    // 2️⃣ EXPIRANDO EM ATÉ 30 DIAS
    if (status === "ACTIVE" && daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 30) {
      return {
        variant: "default" as const,
        icon: <Clock className="h-4 w-4 text-warning" />,
        title: t("notices.expiringSoon").replace("{days}", String(daysUntilExpiry)),
        description: t("notices.expiringSoonDesc"),
        action: {
          href: `/${tenantSlug}/membership/renew`,
          label: t("notices.renewNow"),
        },
      };
    }

    // 3️⃣ PAGAMENTO PENDENTE
    if (paymentStatus === "NOT_PAID" && status === "PENDING_PAYMENT") {
      return {
        variant: "default" as const,
        icon: <CreditCard className="h-4 w-4 text-warning" />,
        title: t("notices.paymentPending"),
        description: t("notices.paymentPendingDesc"),
      };
    }

    return null;
  }, [membership, tenantSlug, t]);

  if (!notice) return null;

  const isDestructive = notice.variant === "destructive";

  return (
    <Alert variant={notice.variant} className={`mb-6 ${!isDestructive ? "border-warning/30 bg-warning/5" : ""}`}>
      {notice.icon}
      <AlertTitle className={!isDestructive ? "text-warning" : undefined}>{notice.title}</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>{notice.description}</span>
        {notice.action && (
          <Link to={notice.action.href}>
            <Button variant="outline" size="sm" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              {notice.action.label}
            </Button>
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
}
