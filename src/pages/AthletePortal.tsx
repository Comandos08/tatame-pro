import React from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { User, Clock, RefreshCw } from "lucide-react";
import { differenceInDays } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useCurrentUser } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

import { PortalLayout } from "@/layouts/PortalLayout";
import { PortalAccessGate } from "@/components/portal/PortalAccessGate";
import { MembershipStatusCard } from "@/components/portal/MembershipStatusCard";
import { PaymentStatusCard } from "@/components/portal/PaymentStatusCard";
import { DigitalCardSection } from "@/components/portal/DigitalCardSection";
import { DiplomasListCard } from "@/components/portal/DiplomasListCard";
import { GradingHistoryCard } from "@/components/portal/GradingHistoryCard";
import { MyEventsCard } from "@/components/portal/MyEventsCard";
import { MembershipTimeline } from "@/components/membership/MembershipTimeline";
import { InAppNotice } from "@/components/notifications/InAppNotice";

import { StatusBadge } from "@/components/ui/status-badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

/* ======================================================
   Types
   ====================================================== */

interface AthleteData {
  id: string;
  full_name: string;
  tenant_id: string;
}

interface MembershipData {
  id: string;
  status: string;
  payment_status: string;
  start_date: string | null;
  end_date: string | null;
  type: string;
  created_at: string;
  reviewed_at?: string | null;
  rejected_at?: string | null;
  webhook_processed_at?: string | null;
}

interface DigitalCardData {
  id: string;
  qr_code_image_url: string | null;
  pdf_url: string | null;
  valid_until: string | null;
  content_hash_sha256: string | null;
  membership_id: string;
}

interface DiplomaData {
  id: string;
  serial_number: string;
  promotion_date: string;
  status: string;
  pdf_url: string | null;
  grading_level_id: string;
}

interface GradingData {
  id: string;
  promotion_date: string;
  grading_level_id: string;
  academy_id: string | null;
  coach_id: string | null;
  notes: string | null;
}

/* ======================================================
   P4B-4 — Helpers puros
   ====================================================== */

const normalizeMembershipStatus = (status?: string) => status?.toUpperCase() ?? null;

const calculateDaysUntilExpiry = (endDate?: string | null) => {
  if (!endDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(endDate);
  expiry.setHours(0, 0, 0, 0);

  return differenceInDays(expiry, today);
};

const getWelcomeMessageKey = (status: string | null) => {
  switch (status) {
    case "ACTIVE":
      return "portal.welcomeActive";
    case "APPROVED":
      return "portal.welcomeApproved";
    case "PENDING_REVIEW":
      return "portal.welcomePending";
    default:
      return "portal.welcome";
  }
};

/* ======================================================
   Component
   ====================================================== */

export default function AthletePortal() {
  const { tenant } = useTenant();
  const { tenantSlug } = useParams();
  const { currentUser } = useCurrentUser();
  const { t } = useI18n();

  /* ---------------- Queries ---------------- */

  const {
    data: athlete,
    isLoading: athleteLoading,
    error: athleteError,
  } = useQuery<AthleteData | null>({
    queryKey: ["portal-athlete", currentUser?.id, tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athletes")
        .select("id, full_name, tenant_id")
        .eq("profile_id", currentUser!.id)
        .eq("tenant_id", tenant!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentUser?.id && !!tenant?.id,
  });

  const { data: membership, isLoading: membershipLoading } = useQuery<MembershipData | null>({
    queryKey: ["portal-membership", athlete?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select(
          "id, status, payment_status, start_date, end_date, type, created_at, reviewed_at, rejected_at, webhook_processed_at",
        )
        .eq("athlete_id", athlete!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!athlete?.id,
  });

  const { data: digitalCard } = useQuery<DigitalCardData | null>({
    queryKey: ["portal-digital-card", membership?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("digital_cards")
        .select("id, qr_code_image_url, pdf_url, valid_until, content_hash_sha256, membership_id")
        .eq("membership_id", membership!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!membership?.id,
  });

  const { data: diplomas = [] } = useQuery<DiplomaData[]>({
    queryKey: ["portal-diplomas", athlete?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diplomas")
        .select("id, serial_number, promotion_date, status, pdf_url, grading_level_id")
        .eq("athlete_id", athlete!.id)
        .eq("status", "ISSUED")
        .order("promotion_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!athlete?.id,
  });

  const { data: gradings = [] } = useQuery<GradingData[]>({
    queryKey: ["portal-gradings", athlete?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athlete_gradings")
        .select("id, promotion_date, grading_level_id, academy_id, coach_id, notes")
        .eq("athlete_id", athlete!.id)
        .order("promotion_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!athlete?.id,
  });

  /* ---------------- Derived state (P4B-4) ---------------- */

  const membershipStatus = normalizeMembershipStatus(membership?.status);
  const daysUntilExpiry = calculateDaysUntilExpiry(membership?.end_date);

  const showRenewalReminder =
    membershipStatus === "ACTIVE" && daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 30;

  const isLoading = athleteLoading || membershipLoading;

  if (!tenant) return null;

  /* ---------------- Render ---------------- */

  return (
    <PortalLayout
      athleteName={athlete?.full_name || "Atleta"}
      tenantName={tenant.name}
      tenantLogo={tenant.logoUrl}
      tenantSlug={tenant.slug}
    >
      <PortalAccessGate
        athlete={athlete ?? null}
        membership={membership ?? null}
        isLoading={isLoading}
        error={athleteError as Error | null}
      >
        {/* P4B-4: Portal Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-display font-bold">{t("portal.title")}</h1>
                {membershipStatus && ["ACTIVE", "APPROVED", "PENDING_REVIEW"].includes(membershipStatus) && (
                  <StatusBadge status={membershipStatus} />
                )}
              </div>
              <p className="text-muted-foreground">{t(getWelcomeMessageKey(membershipStatus))}</p>
            </div>
          </div>
        </div>

        {/* In-App Notifications */}
        <InAppNotice membership={membership} tenantSlug={tenant.slug} />

        {/* P4B-4: Renewal reminder card */}
        {showRenewalReminder && (
          <Alert className="mb-6 border-warning/30 bg-warning/5">
            <Clock className="h-4 w-4 text-warning" />
            <AlertTitle className="text-warning">
              {t("portal.expiringIn").replace("{days}", String(daysUntilExpiry))}
            </AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{t("portal.renewReminder")}</span>
              <Link to={`/${tenantSlug}/membership/renew`}>
                <button className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                  <RefreshCw className="h-4 w-4" />
                  {t("portal.renewNow")}
                </button>
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {/* Portal Content */}
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              {membership && (
                <MembershipStatusCard
                  status={membership.status}
                  type={membership.type}
                  startDate={membership.start_date}
                  endDate={membership.end_date}
                />
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              {membership && <PaymentStatusCard paymentStatus={membership.payment_status} />}
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <DigitalCardSection
              digitalCard={digitalCard ?? null}
              athleteName={athlete?.full_name || ""}
              tenantSlug={tenant.slug}
              showFullCardLink
            />
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <DiplomasListCard diplomas={diplomas} tenantSlug={tenant.slug} />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <GradingHistoryCard gradings={gradings} />
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <MembershipTimeline membership={membership} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <MyEventsCard athleteId={athlete?.id} tenantSlug={tenant.slug} showFullHistoryLink />
          </motion.div>
        </div>
      </PortalAccessGate>
    </PortalLayout>
  );
}
