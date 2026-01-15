import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Award, FileText, TrendingUp, Building2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';

interface DashboardStats {
  activeAthletes: number;
  activeMemberships: number;
  pendingMemberships: number;
  activeAcademies: number;
  diplomasIssued: number;
}

export default function TenantDashboard() {
  const { tenant } = useTenant();
  const { currentUser } = useCurrentUser();
  const { t } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
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
      setLoading(false);
    }

    fetchStats();
  }, [tenant?.id]);

  if (!tenant) return null;

  const statCards = [
    { label: t('dashboard.activeAthletes'), value: stats?.activeAthletes ?? 0, icon: Users, color: tenant.primaryColor },
    { label: t('dashboard.activeMemberships'), value: stats?.activeMemberships ?? 0, icon: FileText, color: '#22c55e' },
    { label: t('dashboard.pendingMemberships'), value: stats?.pendingMemberships ?? 0, icon: TrendingUp, color: '#f59e0b' },
    { label: t('dashboard.activeAcademies'), value: stats?.activeAcademies ?? 0, icon: Building2, color: '#8b5cf6' },
    { label: t('dashboard.diplomasIssued'), value: stats?.diplomasIssued ?? 0, icon: Award, color: '#ec4899' },
  ];

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
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.recentActivity')}</CardTitle>
              <CardDescription>Últimas atualizações do sistema</CardDescription>
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
              <CardDescription>Acesse funções frequentes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <p className="text-muted-foreground text-sm">Atalhos para cadastro de atletas e aprovação de filiações.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
