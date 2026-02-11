
import { Clock, Award, XCircle } from "lucide-react";
import { useAthleteBadgeTimeline } from "@/hooks/useAthleteBadgeTimeline";
import { useI18n } from "@/contexts/I18nContext";
import { formatDate } from "@/lib/i18n/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BadgeTimelineProps {
  athleteId: string | undefined;
  className?: string;
}

/**
 * BadgeTimeline — Histórico read-only de concessões e revogações de badges.
 * Puramente informativo. Sem botões, sem ações, sem hover de ação.
 *
 * @see docs/BADGE-CONTRACT.md
 */
export function BadgeTimeline({ athleteId, className }: BadgeTimelineProps) {
  const { data: events } = useAthleteBadgeTimeline(athleteId);
  const { locale } = useI18n();

  if (!events || events.length === 0) return null;

  return (
    <Card className={className} data-testid="badge-timeline">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Histórico de Badges
        </CardTitle>
        <p className="text-xs text-muted-foreground italic">
          Este histórico é informativo. Badges não concedem permissões nem acesso.
        </p>
      </CardHeader>
      <CardContent>
        <div className="relative space-y-0">
          {/* Timeline line */}
          <div className="absolute left-3 top-1 bottom-1 w-px bg-border" />

          {events.map((event, index) => (
            <div
              key={`${event.badgeCode}-${event.type}-${event.timestamp}-${index}`}
              className="relative flex items-start gap-3 py-2.5"
            >
              {/* Timeline dot */}
              <div className="relative z-10 flex-shrink-0 mt-0.5">
                {event.type === "GRANTED" ? (
                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                    <Award className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                ) : (
                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                    <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-medium">
                    {event.badgeName}
                  </span>
                  {" "}
                  <span className="text-muted-foreground">
                    {event.type === "GRANTED" ? "concedido" : "revogado"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(event.timestamp, locale)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
