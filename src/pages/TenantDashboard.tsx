import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Award, FileText, TrendingUp, Building2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';

interface DashboardStats {
  activeAthletes: number;
  activeMemberships: number;
  pendingMemberships: number;
  activeAcademies: number;
  diplomasIssued: number;
}

interface MonthlyData {
  month: string;
  count: number;
}

export default function TenantDashboard() {
  const { tenant } = useTenant();
  const { currentUser } = useCurrentUser();
  const { t } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [membershipsByMonth, setMembershipsByMonth] = useState<MonthlyData[]>([]);
  const [diplomasByMonth, setDiplomasByMonth] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      if (!tenant?.id) return;

      const [athletes, activeMemberships, pendingMemberships, academies, diplomas] = await Promise.all([
        supabase.from('athletes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
        supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'ACTIVE'),
        supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'PENDING_REVIEW'),
        supabase.from('academies').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('is_active', true),
        supabase.from('diplomas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'ISSUED'),
      ]);

      setStats({
        activeAthletes: athletes.count || 0,
        activeMemberships: activeMemberships.count || 0,
        pendingMemberships: pendingMemberships.count || 0,
        activeAcademies: academies.count || 0,
        diplomasIssued: diplomas.count || 0,
      });
    }

    async function fetchMonthlyData() {
      if (!tenant?.id) return;

      const now = new Date();
      const months: MonthlyData[] = [];
      const diplomaMonths: MonthlyData[] = [];

      // Generate last 12 months
      for (let i = 11; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const monthLabel = format(monthDate, 'MMM yy');
        const start = startOfMonth(monthDate).toISOString();
        const end = endOfMonth(monthDate).toISOString();

        months.push({ month: monthLabel, count: 0 });
        diplomaMonths.push({ month: monthLabel, count: 0 });
      }

      // Fetch memberships created in last 12 months
      const twelveMonthsAgo = startOfMonth(subMonths(now, 11)).toISOString();
      const { data: memberships } = await supabase
        .from('memberships')
        .select('created_at')
        .eq('tenant_id', tenant.id)
        .gte('created_at', twelveMonthsAgo);

      // Fetch diplomas issued in last 12 months
      const { data: diplomasData } = await supabase
        .from('diplomas')
        .select('issued_at')
        .eq('tenant_id', tenant.id)
        .eq('status', 'ISSUED')
        .gte('issued_at', twelveMonthsAgo);

      // Count memberships by month
      if (memberships) {
        memberships.forEach(m => {
          if (m.created_at) {
            const monthLabel = format(new Date(m.created_at), 'MMM yy');
            const monthEntry = months.find(entry => entry.month === monthLabel);
            if (monthEntry) monthEntry.count++;
          }
        });
      }

      // Count diplomas by month
      if (diplomasData) {
        diplomasData.forEach(d => {
          if (d.issued_at) {
            const monthLabel = format(new Date(d.issued_at), 'MMM yy');
            const monthEntry = diplomaMonths.find(entry => entry.month === monthLabel);
            if (monthEntry) monthEntry.count++;
          }
        });
      }

      setMembershipsByMonth(months);
      setDiplomasByMonth(diplomaMonths);
    }

    Promise.all([fetchStats(), fetchMonthlyData()]).finally(() => setLoading(false));
  }, [tenant?.id]);

  if (!tenant) return null;

  const statCards = [
    { label: t('dashboard.activeAthletes'), value: stats?.activeAthletes ?? 0, icon: Users, color: tenant.primaryColor },
    { label: t('dashboard.activeMemberships'), value: stats?.activeMemberships ?? 0, icon: FileText, color: '#22c55e' },
    { label: t('dashboard.pendingMemberships'), value: stats?.pendingMemberships ?? 0, icon: TrendingUp, color: '#f59e0b' },
    { label: t('dashboard.activeAcademies'), value: stats?.activeAcademies ?? 0, icon: Building2, color: '#8b5cf6' },
    { label: t('dashboard.diplomasIssued'), value: stats?.diplomasIssued ?? 0, icon: Award, color: '#ec4899' },
  ];

  const chartConfig = {
    count: {
      label: t('dashboard.count'),
      color: 'hsl(var(--primary))',
    },
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="font-display text-3xl font-bold mb-2">
            {t('dashboard.welcome')}, {currentUser?.name || 'Usuário'}! 👋
          </motion.h1>
          <p className="text-muted-foreground">{t('dashboard.welcomeDesc')}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {statCards.map((stat, index) => (
                <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                  <Card className="card-hover">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                      <stat.icon className="h-4 w-4" style={{ color: stat.color }} />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-display font-bold">{stat.value}</div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Charts */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Memberships by Month */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('dashboard.membershipsByMonth')}</CardTitle>
                  <CardDescription>{t('dashboard.last12Months')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[250px] w-full">
                    <BarChart data={membershipsByMonth} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <XAxis 
                        dataKey="month" 
                        tickLine={false} 
                        axisLine={false}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis 
                        tickLine={false} 
                        axisLine={false}
                        tick={{ fontSize: 12 }}
                        allowDecimals={false}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar 
                        dataKey="count" 
                        fill="hsl(var(--primary))" 
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Diplomas by Month */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('dashboard.diplomasByMonth')}</CardTitle>
                  <CardDescription>{t('dashboard.last12Months')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[250px] w-full">
                    <BarChart data={diplomasByMonth} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <XAxis 
                        dataKey="month" 
                        tickLine={false} 
                        axisLine={false}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis 
                        tickLine={false} 
                        axisLine={false}
                        tick={{ fontSize: 12 }}
                        allowDecimals={false}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar 
                        dataKey="count" 
                        fill="hsl(var(--chart-2))" 
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            {/* Activity cards */}
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('dashboard.recentActivity')}</CardTitle>
                  <CardDescription>{t('dashboard.recentActivityDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-dashed border-border p-8 text-center">
                    <p className="text-muted-foreground text-sm">{t('dashboard.noRecentActivity')}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('dashboard.quickActions')}</CardTitle>
                  <CardDescription>{t('dashboard.quickActionsDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-dashed border-border p-8 text-center">
                    <p className="text-muted-foreground text-sm">{t('dashboard.quickActionsHint')}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
