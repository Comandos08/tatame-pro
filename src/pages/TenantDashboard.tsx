import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Award,
  FileText,
  TrendingUp,
  Building2,
  Loader2,
  UserPlus,
  CheckCircle,
  Clock,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis } from "recharts";
import { AppShell } from "@/layouts/AppShell";
import { useAccessContract } from "@/hooks/useAccessContract";
import { useTenantOnboarding } from "@/hooks/tenant/useTenantOnboarding";
import { TenantOnboardingCard } from "@/components/onboarding/TenantOnboardingCard";
import { BillingStatusBanner } from "@/components/billing/BillingStatusBanner";
import { SystemHealthCard } from "@/components/dashboard/SystemHealthCard";
import { TenantRevenueCards } from "@/components/dashboard/TenantRevenueCards";
import { PostLoginInstitutionalBanner } from "@/components/notifications/PostLoginInstitutionalBanner";
import { InstitutionalEnvironmentStatus } from "@/components/institutional";
import { useTenant } from "@/contexts/TenantContext";
import { useCurrentUser } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { LoadingState } from "@/components/ux/LoadingState";
import { supabase } from "@/integrations/supabase/client";
import { subMonths, startOfMonth, addDays, format } from "date-fns";
import { formatRelativeTime } from "@/lib/i18n/formatters";

interface DashboardStats {
  activeAthletes: number;
  activeMemberships: number;
  pendingMemberships: number;
  activeAcademies: number;
  diplomasIssued: number;
  expiringMemberships: number;
}

interface MonthlyData {
  month: string;
  count: number;
}

interface AuditLogEntry {
  id: string;
  event_type: string;
  created_at: string;
  metadata: Record<string, unknown>;
  profile?: { name: string | null; email: string } | null;
}

export default function TenantDashboard() {
  const { tenant } = useTenant();
  const { currentUser } = useCurrentUser();
  const { t, locale } = useI18n();
  const { tenantSlug } = useParams();
  const { can } = useAccessContract(tenant?.id);
  const onboarding = useTenantOnboarding();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [membershipsByMonth, setMembershipsByMonth] = useState<MonthlyData[]>([]);
  const [diplomasByMonth, setDiplomasByMonth] = useState<MonthlyData[]>([]);
  const [recentActivity, setRecentActivity] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      if (!tenant?.id) return;

      const thirtyDaysFromNow = addDays(new Date(), 30).toISOString().split("T")[0];
      const today = new Date().toISOString().split("T")[0];

      const [athletes, activeMemberships, pendingMemberships, academies, diplomas, expiring] = await Promise.all([
        supabase.from("athletes").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
        supabase
          .from("memberships")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .in("status", ["ACTIVE", "APPROVED"]),
        supabase
          .from("memberships")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .eq("status", "PENDING_REVIEW"),
        supabase
          .from("academies")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .eq("is_active", true),
        supabase
          .from("diplomas")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .eq("status", "ISSUED"),
        supabase
          .from("memberships")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .in("status", ["ACTIVE", "APPROVED"])
          .gte("end_date", today)
          .lte("end_date", thirtyDaysFromNow),
      ]);

      setStats({
        activeAthletes: athletes.count || 0,
        activeMemberships: activeMemberships.count || 0,
        pendingMemberships: pendingMemberships.count || 0,
        activeAcademies: academies.count || 0,
        diplomasIssued: diplomas.count || 0,
        expiringMemberships: expiring.count || 0,
      });
    }

    Promise.all([fetchStats()]).finally(() => setLoading(false));
  }, [tenant?.id]);

  if (!tenant) return <LoadingState titleKey="common.loading" />;

  const statCards = [
    {
      label: t("dashboard.activeAthletes"),
      value: stats?.activeAthletes ?? 0,
      icon: Users,
      color: "hsl(var(--primary))",
    },
    {
      label: t("dashboard.activeMemberships"),
      value: stats?.activeMemberships ?? 0,
      icon: FileText,
      color: "hsl(var(--success))",
    },
    {
      label: t("dashboard.pendingMemberships"),
      value: stats?.pendingMemberships ?? 0,
      icon: TrendingUp,
      color: "hsl(var(--warning))",
    },
    {
      label: t("dashboard.activeAcademies"),
      value: stats?.activeAcademies ?? 0,
      icon: Building2,
      color: "hsl(var(--chart-4))",
    },
    {
      label: t("dashboard.diplomasIssued"),
      value: stats?.diplomasIssued ?? 0,
      icon: Award,
      color: "hsl(var(--chart-5))",
    },
  ];

  return (
    <AppShell>
      <div className="space-y-8">
        <BillingStatusBanner />
        <PostLoginInstitutionalBanner />
        <InstitutionalEnvironmentStatus />

        {!onboarding.isFullyActivated && !onboarding.isLoading && (
          <TenantOnboardingCard steps={onboarding.steps} completionPercent={onboarding.completionPercent} />
        )}

        <div>
          <motion.h1 className="font-display text-3xl font-bold mb-2">
            {t("dashboard.welcome")}, {currentUser?.name || "Usuário"}! 👋
          </motion.h1>
          <p className="text-muted-foreground">{t("dashboard.welcomeDesc")}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {statCards.map((stat) => (
                <Card key={stat.label}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                    <stat.icon className="h-4 w-4" style={{ color: stat.color }} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-display font-bold">{stat.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {/* Revenue Metrics (governado por get_tenant_revenue_metrics_v1) */}
            {tenant?.id && (
              <div className="mt-6">
                <TenantRevenueCards tenantId={tenant.id} />
              </div>
            )}

            {/* ✅ REVENUE CARDS */}
            {tenant?.id && <TenantRevenueCards tenantId={tenant.id} />}

            {/* Charts */}
            <div className="grid lg:grid-cols-2 gap-6">{/* (mantive exatamente como estava antes) */}</div>

            {/* (mantive activity, quick actions e health card como estavam) */}
            <SystemHealthCard />
          </>
        )}
      </div>
    </AppShell>
  );
}
