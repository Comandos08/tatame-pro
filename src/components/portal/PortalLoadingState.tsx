
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/contexts/I18nContext";

interface PortalLoadingStateProps {
  title?: string;
  description?: string;
}

export function PortalLoadingState({ title, description }: PortalLoadingStateProps) {
  const { t } = useI18n();

  const displayTitle = title ?? t("portal.loading");
  const displayDescription = description ?? t("portal.loadingDescription");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          {displayTitle}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          {displayDescription}
        </p>
      </CardContent>
    </Card>
  );
}
