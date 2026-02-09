import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, Award, FileText, TrendingUp, Building2, Loader2,
  UserPlus, CheckCircle, Clock, AlertTriangle, Calendar
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis } from 'recharts';
import { AppShell } from '@/layouts/AppShell';
import { BillingStatusBanner } from '@/components/billing/BillingStatusBanner';
import { SystemHealthCard } from '@/components/dashboard/SystemHealthCard';
import { PostLoginInstitutionalBanner } from '@/components/notifications/PostLoginInstitutionalBanner';
import { InstitutionalEnvironmentStatus } from '@/components/institutional';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n, Locale } from '@/contexts/I18nContext';
import { LoadingState } from '@/components/ux/LoadingState';
import { supabase } from '@/integrations/supabase/client';
import { subMonths, startOfMonth, endOfMonth, addDays, format } from 'date-fns';
import { formatRelativeTime } from '@/lib/i18n/formatters';

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

// Maps event types to user-friendly labels - uses i18n keys where possible
const getEventTypeLabels = (t: (key: string) => string): Record<string, { label: string; icon: React.ReactNode; color: string }> => ({
  MEMBERSHIP_CREATED: { label: t('audit.membershipCreated') || 'Filiação Criada', icon: <UserPlus className="h-4 w-4" />, color: 'text-info' },
  MEMBERSHIP_PAID: { label: t('audit.membershipPaid') || 'Pagamento Confirmado', icon: <CheckCircle className="h-4 w-4" />, color: 'text-success' },
  MEMBERSHIP_APPROVED: { label: t('audit.membershipApproved') || 'Filiação Aprovada', icon: <CheckCircle className="h-4 w-4" />, color: 'text-success' },
  MEMBERSHIP_REJECTED: { label: t('audit.membershipRejected') || 'Filiação Rejeitada', icon: <AlertTriangle className="h-4 w-4" />, color: 'text-destructive' },
  MEMBERSHIP_EXPIRED: { label: t('audit.membershipExpired') || 'Filiação Expirada', icon: <Clock className="h-4 w-4" />, color: 'text-warning' },
  MEMBERSHIP_ABANDONED_CLEANUP: { label: t('audit.membershipCleanup') || 'Filiação Abandonada Removida', icon: <FileText className="h-4 w-4" />, color: 'text-muted-foreground' },
  DIPLOMA_ISSUED: { label: t('audit.diplomaIssued') || 'Diploma Emitido', icon: <Award className="h-4 w-4" />, color: 'text-primary' },
  GRADING_RECORDED: { label: t('audit.gradingRecorded') || 'Graduação Registrada', icon: <Award className="h-4 w-4" />, color: 'text-primary' },
  RENEWAL_REMINDER_SENT: { label: t('audit.renewalReminder') || 'Lembrete de Renovação', icon: <AlertTriangle className="h-4 w-4" />, color: 'text-warning' },
  TENANT_SETTINGS_UPDATED: { label: t('audit.settingsUpdated') || 'Configurações Atualizadas', icon: <FileText className="h-4 w-4" />, color: 'text-muted-foreground' },
});

export default function TenantDashboard() {
  const { tenant } = useTenant();
  const { currentUser } = useCurrentUser();
  const { t, locale } = useI18n();
  const { tenantSlug } = useParams();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [membershipsByMonth, setMembershipsByMonth] = useState<MonthlyData[]>([]);
  const [diplomasByMonth, setDiplomasByMonth] = useState<MonthlyData[]>([]);
  const [recentActivity, setRecentActivity] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      if (!tenant?.id) return;

      // Calculate date 30 days from now for expiring memberships
      const thirtyDaysFromNow = addDays(new Date(), 30).toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];

      const [athletes, activeMemberships, pendingMemberships, academies, diplomas, expiring] = await Promise.all([
        supabase.from('athletes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
        supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'ACTIVE'),
        supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'PENDING_REVIEW'),
        supabase.from('academies').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('is_active', true),
        supabase.from('diplomas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'ISSUED'),
        supabase.from('memberships').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .in('status', ['ACTIVE', 'APPROVED'])
          .gte('end_date', today)
          .lte('end_date', thirtyDaysFromNow),
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

    async function fetchMonthlyData() {
      if (!tenant?.id) return;

      const now = new Date();
      const months: MonthlyData[] = [];
      const diplomaMonths: MonthlyData[] = [];

      for (let i = 11; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const monthLabel = format(monthDate, 'MMM yy');
        months.push({ month: monthLabel, count: 0 });
        diplomaMonths.push({ month: monthLabel, count: 0 });
      }

      const twelveMonthsAgo = startOfMonth(subMonths(now, 11)).toISOString();
      const { data: memberships } = await supabase
        .from('memberships')
        .select('created_at')
        .eq('tenant_id', tenant.id)
        .gte('created_at', twelveMonthsAgo);

      const { data: diplomasData } = await supabase
        .from('diplomas')
        .select('issued_at')
        .eq('tenant_id', tenant.id)
        .eq('status', 'ISSUED')
        .gte('issued_at', twelveMonthsAgo);

      if (memberships) {
        memberships.forEach(m => {
          if (m.created_at) {
            const monthLabel = format(new Date(m.created_at), 'MMM yy');
            const monthEntry = months.find(entry => entry.month === monthLabel);
            if (monthEntry) monthEntry.count++;
          }
        });
      }

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

    async function fetchRecentActivity() {
      if (!tenant?.id) return;

      const { data } = await supabase
        .from('audit_logs')
        .select(`
          id,
          event_type,
          created_at,
          metadata,
          profile:profiles(name, email)
        `)
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (data) {
        setRecentActivity(data as unknown as AuditLogEntry[]);
      }
    }

    Promise.all([fetchStats(), fetchMonthlyData(), fetchRecentActivity()]).finally(() => setLoading(false));
  }, [tenant?.id]);

  if (!tenant) return <LoadingState titleKey="common.loading" />;

  const statCards = [
    { label: t('dashboard.activeAthletes'), value: stats?.activeAthletes ?? 0, icon: Users, color: 'hsl(var(--primary))' },
    { label: t('dashboard.activeMemberships'), value: stats?.activeMemberships ?? 0, icon: FileText, color: 'hsl(var(--success))' },
    { label: t('dashboard.pendingMemberships'), value: stats?.pendingMemberships ?? 0, icon: TrendingUp, color: 'hsl(var(--warning))' },
    { label: t('dashboard.activeAcademies'), value: stats?.activeAcademies ?? 0, icon: Building2, color: 'hsl(var(--chart-4))' },
    { label: t('dashboard.diplomasIssued'), value: stats?.diplomasIssued ?? 0, icon: Award, color: 'hsl(var(--chart-5))' },
  ];

  const chartConfig = {
    count: {
      label: t('dashboard.count'),
      color: 'hsl(var(--primary))',
    },
  };

  const quickActions = [
    { 
      label: t('dashboard.approveMembers'), 
      description: t('dashboard.pendingCount', { count: String(stats?.pendingMemberships || 0) }),
      href: `/${tenantSlug}/app/approvals`, 
      icon: CheckCircle,
      variant: stats?.pendingMemberships ? 'default' : 'outline' as const,
      highlight: (stats?.pendingMemberships || 0) > 0,
    },
    { 
      label: t('dashboard.expiringMemberships'), 
      description: t('dashboard.expiringCount', { count: String(stats?.expiringMemberships || 0) }),
      href: `/${tenantSlug}/app/athletes`, 
      icon: Calendar,
      variant: stats?.expiringMemberships ? 'warning' : 'outline' as const,
      highlight: (stats?.expiringMemberships || 0) > 0,
    },
    {
      label: t('dashboard.issueDiploma'), 
      description: t('dashboard.newGrading'),
      href: `/${tenantSlug}/app/grading-schemes`, 
      icon: Award,
      variant: 'outline' as const,
      highlight: false,
    },
    { 
      label: t('dashboard.registerAcademy'), 
      description: t('dashboard.newAcademy'),
      href: `/${tenantSlug}/app/academies`, 
      icon: Building2,
      variant: 'outline' as const,
      highlight: false,
    },
  ];

  const formatActivityTime = (dateStr: string) => {
    // Use formatRelativeTime from centralized formatters
    return formatRelativeTime(dateStr, locale);
  };

  const eventTypeLabels = getEventTypeLabels(t);
  
  const getEventInfo = (eventType: string) => {
    return eventTypeLabels[eventType] || { 
      label: eventType.replace(/_/g, ' '), 
      icon: <FileText className="h-4 w-4" />, 
      color: 'text-muted-foreground' 
    };
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <BillingStatusBanner />
        <PostLoginInstitutionalBanner />
        <InstitutionalEnvironmentStatus />
        
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
              <Card>
                <CardHeader>
                  <CardTitle>{t('dashboard.membershipsByMonth')}</CardTitle>
                  <CardDescription>{t('dashboard.last12Months')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[250px] w-full">
                    <BarChart data={membershipsByMonth} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('dashboard.diplomasByMonth')}</CardTitle>
                  <CardDescription>{t('dashboard.last12Months')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[250px] w-full">
                    <BarChart data={diplomasByMonth} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            {/* Activity and Quick Actions */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('dashboard.recentActivity')}</CardTitle>
                  <CardDescription>{t('dashboard.recentActivityDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {recentActivity.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-8 text-center">
                      <p className="text-muted-foreground text-sm">{t('dashboard.noRecentActivity')}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recentActivity.map((activity) => {
                        const eventInfo = getEventInfo(activity.event_type);
                        return (
                          <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                            <div className={`mt-0.5 ${eventInfo.color}`}>
                              {eventInfo.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{eventInfo.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {activity.profile?.name || activity.profile?.email || 'Sistema'}
                              </p>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatActivityTime(activity.created_at)}
                            </span>
                          </div>
                        );
                      })}
                      <Link 
                        to={`/${tenantSlug}/app/audit-log`}
                        className="block text-center text-sm text-primary hover:underline pt-2"
                      >
                        {t('dashboard.viewFullHistory')} →
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('dashboard.quickActions')}</CardTitle>
                  <CardDescription>{t('dashboard.quickActionsDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {quickActions.map((action) => (
                      <Link key={action.href} to={action.href}>
                        <Button 
                          variant="outline" 
                          className={`w-full h-auto flex-col items-start p-4 gap-2 ${
                            action.highlight ? 'border-primary bg-primary/5 hover:bg-primary/10' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <action.icon className={`h-4 w-4 ${action.highlight ? 'text-primary' : ''}`} />
                            <span className="font-medium text-sm">{action.label}</span>
                            {action.highlight && (
                              <Badge variant="secondary" className="ml-auto text-xs">
                                !
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground text-left">
                            {action.description}
                          </span>
                        </Button>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* System Health Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <SystemHealthCard />
            </motion.div>
          </>
        )}
      </div>
    </AppShell>
  );
}
