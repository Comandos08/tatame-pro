// (removido useState)
import { Loader2, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/layouts/AppShell";
import { useTenant } from "@/contexts/TenantContext";
import { useI18n } from "@/contexts/I18nContext";
import { formatDate, formatCurrency } from "@/lib/i18n/formatters";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MEMBERSHIP_STATUS_LABELS, PAYMENT_STATUS_LABELS, MembershipStatus, PaymentStatus } from "@/types/membership";

interface MembershipApplication {
  id: string;
  status: MembershipStatus;
  payment_status: PaymentStatus;
  created_at: string;
  price_cents: number;
  currency: string;
  applicant_data: any;
}

export default function ApprovalDetails() {
  const { tenant } = useTenant();
  const { membershipId, tenantSlug } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useI18n();

  const {
    data: membership,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["approval-membership", tenant?.id, membershipId],
    queryFn: async () => {
      if (!tenant?.id || !membershipId) return null;

      const { data, error } = await supabase
        .from("memberships")
        .select("*")
        .eq("id", membershipId)
        .eq("tenant_id", tenant.id)
        .maybeSingle();

      if (error) throw error;
      return data as MembershipApplication | null;
    },
    enabled: Boolean(tenant?.id && membershipId),
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  if (!tenant) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/${tenantSlug}/app/approvals`)}>
          ← {t("common.back")}
        </Button>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}

        {!isLoading && error && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <p>{t("common.error")}</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && !membership && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <p>{t("common.notFound")}</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && membership && (
          <Card>
            <CardHeader>
              <CardTitle>#{membership.id.substring(0, 8).toUpperCase()}</CardTitle>
              <CardDescription>{formatDate(membership.created_at, locale)}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <Badge>{MEMBERSHIP_STATUS_LABELS[membership.status]}</Badge>

              <Badge variant="outline">{PAYMENT_STATUS_LABELS[membership.payment_status]}</Badge>

              <div>
                <p className="text-sm text-muted-foreground">{t("common.value")}</p>
                <p className="font-medium">{formatCurrency(membership.price_cents, locale)}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Nome</p>
                <p className="font-medium">{membership.applicant_data?.full_name ?? "—"}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{membership.applicant_data?.email ?? "—"}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
