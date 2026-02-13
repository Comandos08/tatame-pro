import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/layouts/AppShell";
import { useTenant } from "@/contexts/TenantContext";
import { useI18n } from "@/contexts/I18nContext";
import { usePermissions } from "@/hooks/usePermissions";
import { formatDate, formatCurrency } from "@/lib/i18n/formatters";
import { supabase } from "@/integrations/supabase/client";
import { MEMBERSHIP_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/types/membership";

interface MembershipApplication {
  id: string;
  status: string;
  payment_status: string;
  created_at: string;
  price_cents: number;
  currency: string;
  applicant_data: any;
  applicant_profile_id: string | null;
  athlete_id: string | null;
  athlete: any | null;
  profile: any | null;
}

export default function ApprovalDetails() {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const { tenantSlug, membershipId } = useParams();
  const { t, locale } = useI18n();
  const { can } = usePermissions();

  const canApprove = can("TENANT_APPROVALS");

  const {
    data: membership,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["approval-membership", membershipId, tenant?.id],
    queryFn: async () => {
      if (!membershipId || !tenant?.id) return null;

      const { data, error } = await supabase
        .from("memberships")
        .select(
          `
          id,
          status,
          payment_status,
          created_at,
          price_cents,
          currency,
          applicant_data,
          applicant_profile_id,
          athlete_id,
          athlete:athletes!athlete_id(full_name, email),
          profile:profiles!applicant_profile_id(name, email)
        `,
        )
        .eq("id", membershipId)
        .eq("tenant_id", tenant.id)
        .maybeSingle();

      if (error) throw error;

      return data as MembershipApplication | null;
    },
    enabled: !!membershipId && !!tenant?.id,
  });

  if (!tenant) return null;

  if (!canApprove) {
    return (
      <AppShell>
        <div className="p-8 text-center text-muted-foreground">{t("common.accessDenied")}</div>
      </AppShell>
    );
  }

  const displayName =
    membership?.athlete?.full_name ??
    membership?.profile?.name ??
    membership?.applicant_data?.full_name ??
    "Nome não disponível";

  const displayEmail =
    membership?.athlete?.email ??
    membership?.profile?.email ??
    membership?.applicant_data?.email ??
    "Email não disponível";

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <button
          onClick={() => navigate(`/${tenantSlug}/app/approvals`)}
          className="flex items-center text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("common.back")}
        </button>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin h-6 w-6" />
          </div>
        ) : error || !membership ? (
          <div className="text-center py-12 text-muted-foreground">
            <AlertCircle className="mx-auto mb-2" />
            {t("common.notFound")}
          </div>
        ) : (
          <div className="border rounded-xl p-6 space-y-4">
            <h2 className="text-xl font-semibold">{displayName}</h2>
            <p className="text-muted-foreground text-sm">{displayEmail}</p>

            <div className="flex gap-3 mt-4">
              <span className="px-3 py-1 text-xs rounded bg-muted">{MEMBERSHIP_STATUS_LABELS[membership.status]}</span>
              <span className="px-3 py-1 text-xs rounded border">
                {PAYMENT_STATUS_LABELS[membership.payment_status]}
              </span>
            </div>

            <div className="text-sm mt-4">
              <strong>{t("common.value")}:</strong> {formatCurrency(membership.price_cents, locale)}
            </div>

            <div className="text-sm">
              <strong>{t("approval.requestedAt")}:</strong> {formatDate(membership.created_at, locale)}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
