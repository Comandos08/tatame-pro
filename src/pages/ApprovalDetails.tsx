// 🔒 SAFE GOLD VERSION — TENANT SCOPED

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  User,
  Calendar,
  Mail,
  Phone,
  FileText,
  Download,
  Loader2,
  AlertCircle,
  CreditCard,
  Building2,
  QrCode,
  UserCheck,
  MapPin,
  ShieldAlert,
} from "lucide-react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/layouts/AppShell";
import { useTenant } from "@/contexts/TenantContext";
import { useI18n } from "@/contexts/I18nContext";
import { usePermissions } from "@/hooks/usePermissions";
import { formatDate, formatCurrency } from "@/lib/i18n/formatters";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import {
  MembershipStatus,
  PaymentStatus,
  MEMBERSHIP_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  GENDER_LABELS,
  GenderType,
} from "@/types/membership";

import type { AppRole } from "@/types/auth";

/* ============================================================
   TYPES
============================================================ */

interface ApplicantData {
  full_name?: string;
  birth_date?: string;
  national_id?: string;
  gender?: GenderType;
  email?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

interface MembershipApplication {
  id: string;
  status: MembershipStatus;
  payment_status: PaymentStatus;
  created_at: string;
  price_cents: number;
  currency: string;
  applicant_data: ApplicantData | null;
  applicant_profile_id: string | null;
  athlete_id: string | null;
  academy_id: string | null;
  preferred_coach_id: string | null;
  athlete: any | null;
  profile: any | null;
  academy: any | null;
  coach: any | null;
  digital_cards: any[];
}

/* ============================================================
   COMPONENT
============================================================ */

export default function ApprovalDetails() {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenantSlug, membershipId } = useParams();
  const { t, locale } = useI18n();

  const { can } = usePermissions();
  const canApprove = can("TENANT_APPROVALS");

  /* ============================================================
     QUERY — FIX DEFINITIVO
  ============================================================ */

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
          academy_id,
          preferred_coach_id,
          athlete:athletes!athlete_id(*),
          profile:profiles!applicant_profile_id(id, name, email),
          academy:academies!academy_id(id, name),
          coach:coaches!preferred_coach_id(id, full_name),
          digital_cards(id, qr_code_image_url, pdf_url)
        `,
        )
        .eq("id", membershipId)
        .eq("tenant_id", tenant.id) // 🔥 FIX CRÍTICO
        .maybeSingle();

      if (error) throw error;

      return data as MembershipApplication | null;
    },
    enabled: !!membershipId && !!tenant?.id,
  });

  /* ============================================================
     DERIVED DATA
  ============================================================ */

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

  /* ============================================================
     RENDER
  ============================================================ */

  if (!tenant) return null;

  if (!canApprove) {
    return (
      <AppShell>
        <div className="p-8 text-center text-muted-foreground">{t("common.accessDenied")}</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
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
          <>
            <div className="border rounded-xl p-6 space-y-4">
              <h2 className="text-xl font-semibold">{displayName}</h2>

              <p className="text-muted-foreground text-sm">{displayEmail}</p>

              <div className="flex gap-3 mt-4">
                <span className="px-3 py-1 text-xs rounded bg-muted">
                  {MEMBERSHIP_STATUS_LABELS[membership.status]}
                </span>
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
          </>
        )}
      </div>
    </AppShell>
  );
}
