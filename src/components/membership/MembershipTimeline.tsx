import React, { useMemo } from "react";
import { format } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { FileText, CheckCircle, CreditCard, Calendar, XCircle, AlertCircle, Clock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalEmptyState } from "@/components/portal/PortalEmptyState";
import { useI18n } from "@/contexts/I18nContext";

/* ======================================================
   Types
   ====================================================== */

interface MembershipData {
  id: string;
  status: string;
  payment_status: string;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  type: string;
  reviewed_at?: string | null;
  rejected_at?: string | null;
  webhook_processed_at?: string | null;
}

type TimelineEventType = "CREATED" | "RENEWAL" | "PAID" | "APPROVED" | "ACTIVE" | "EXPIRED" | "REJECTED" | "CANCELLED";

interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  date: string;
}

interface MembershipTimelineProps {
  membership: MembershipData | null;
}

/* ======================================================
   Component
   ====================================================== */

export function MembershipTimeline({ membership }: MembershipTimelineProps) {
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

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd MMM yyyy", {
        locale: getDateLocale(),
      });
    } catch {
      return dateStr;
    }
  };

  /* ---------------- Timeline build ---------------- */

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    if (!membership) return [];

    const events: TimelineEvent[] = [];
    const status = membership.status?.toUpperCase();

    // CREATED / RENEWAL
    events.push({
      id: "created",
      type: membership.type === "RENEWAL" ? "RENEWAL" : "CREATED",
      date: membership.created_at,
    });

    // PAID
    if (membership.payment_status === "PAID") {
      events.push({
        id: "paid",
        type: "PAID",
        date: membership.webhook_processed_at || membership.created_at,
      });
    }

    // APPROVED
    if (["APPROVED", "ACTIVE"].includes(status)) {
      events.push({
        id: "approved",
        type: "APPROVED",
        date: membership.reviewed_at || membership.start_date || membership.created_at,
      });
    }

    // ACTIVE
    if (status === "ACTIVE" && membership.start_date) {
      events.push({
        id: "active",
        type: "ACTIVE",
        date: membership.start_date,
      });
    }

    // EXPIRED
    if (status === "EXPIRED" && membership.end_date) {
      events.push({
        id: "expired",
        type: "EXPIRED",
        date: membership.end_date,
      });
    }

    // REJECTED
    if (status === "REJECTED") {
      events.push({
        id: "rejected",
        type: "REJECTED",
        date: membership.rejected_at || membership.created_at,
      });
    }

    // CANCELLED
    if (status === "CANCELLED") {
      events.push({
        id: "cancelled",
        type: "CANCELLED",
        date: membership.created_at,
      });
    }

    // Ordenar do mais recente para o mais antigo
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [membership]);

  /* ---------------- UI config ---------------- */

  const getEventConfig = (type: TimelineEventType) => {
    switch (type) {
      case "CREATED":
        return { icon: FileText, label: t("timeline.created"), color: "text-blue-500", bg: "bg-blue-500/10" };
      case "RENEWAL":
        return { icon: Calendar, label: t("timeline.renewed"), color: "text-purple-500", bg: "bg-purple-500/10" };
      case "PAID":
        return { icon: CreditCard, label: t("timeline.paid"), color: "text-green-500", bg: "bg-green-500/10" };
      case "APPROVED":
        return { icon: CheckCircle, label: t("timeline.approved"), color: "text-emerald-600", bg: "bg-emerald-600/10" };
      case "ACTIVE":
        return { icon: CheckCircle, label: t("timeline.active"), color: "text-emerald-500", bg: "bg-emerald-500/10" };
      case "EXPIRED":
        return { icon: AlertCircle, label: t("timeline.expired"), color: "text-red-500", bg: "bg-red-500/10" };
      case "REJECTED":
        return { icon: XCircle, label: t("timeline.rejected"), color: "text-red-600", bg: "bg-red-600/10" };
      case "CANCELLED":
        return { icon: XCircle, label: t("timeline.cancelled"), color: "text-muted-foreground", bg: "bg-muted" };
      default:
        return { icon: Clock, label: type, color: "text-muted-foreground", bg: "bg-muted" };
    }
  };

  if (!membership || timelineEvents.length === 0) {
    return (
      <PortalEmptyState
        title={t("timeline.title")}
        description={t("timeline.noEvents")}
        icon={Clock}
      />
    );
  }

  /* ---------------- Render ---------------- */

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5 text-primary" />
          {t("timeline.title")}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

          <div className="space-y-4">
            {timelineEvents.map((event, index) => {
              const cfg = getEventConfig(event.type);
              const Icon = cfg.icon;
              const isLast = index === timelineEvents.length - 1;

              return (
                <div key={event.id} className="relative flex items-start gap-4">
                  <div
                    className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${cfg.bg} ${cfg.color}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className={`flex-1 ${!isLast ? "pb-4" : ""}`}>
                    <p className="text-sm font-medium">{cfg.label}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(event.date)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
