import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Building2, Users, LogOut, Activity, ExternalLink, 
  Loader2, RefreshCw, Sun, Moon, Monitor, Globe, HelpCircle, Check,
  Edit2, UserCog, Calendar, CreditCard, TrendingUp, AlertTriangle, Clock, 
  Shield, Image
} from 'lucide-react';
import iconLogo from '@/assets/iconLogo.png';
import { LoadingState } from '@/components/ux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, StatusType } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { logger } from '@/lib/logger';
import { useI18n, Locale } from '@/contexts/I18nContext';
import { formatDate, formatCurrency, formatNumber } from '@/lib/i18n/formatters';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CreateTenantDialog } from '@/components/admin/CreateTenantDialog';
import { EditTenantDialog } from '@/components/admin/EditTenantDialog';
import { ManageAdminsDialog } from '@/components/admin/ManageAdminsDialog';
import { TenantBillingDialog } from '@/components/admin/TenantBillingDialog';


import { StartImpersonationDialog } from '@/components/impersonation/StartImpersonationDialog';
import { PostLoginInstitutionalBanner } from '@/components/notifications/PostLoginInstitutionalBanner';
import { InstitutionalEnvironmentStatus } from '@/components/institutional';

const AVAILABLE_LOCALES: { code: Locale; label: string }[] = [
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

interface Tenant {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sport_types: string[];
  default_locale: string;
  primary_color: string;
  is_active: boolean;
  created_at: string;
  stripe_customer_id: string | null;
}

interface TenantBilling {
  id: string;
  tenant_id: string;
  status: string;
  current_period_end: string | null;
  is_manual_override: boolean;
  override_at: string | null;
}

// Map billing status to StatusBadge status type
const billingStatusMap: Record<string, StatusType> = {
  ACTIVE: 'ACTIVE',
  TRIALING: 'TRIALING',
  PAST_DUE: 'PAST_DUE',
  CANCELED: 'CANCELLED',
  INCOMPLETE: 'INCOMPLETE',
  UNPAID: 'UNPAID',
};

export default function AdminDashboard() {
  const { currentUser, signOut, isGlobalSuperadmin, isLoading: authLoading } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();

  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [managingAdminsTenant, setManagingAdminsTenant] = useState<Tenant | null>(null);
  const [billingTenant, setBillingTenant] = useState<Tenant | null>(null);
  const [impersonatingTenant, setImpersonatingTenant] = useState<Tenant | null>(null);

  // 🔐 Access control delegated to RequireGlobalRoles wrapper in App.tsx

  // 🔐 HARDENED: Logout goes to /portal which will redirect to /login if needed
  const handleSignOut = async () => {
    await signOut();
    navigate('/portal');
  };

  // Fetch all tenants
  const { data: tenants, isLoading: tenantsLoading, refetch } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Tenant[];
    },
    enabled: isGlobalSuperadmin,
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [tenantsRes, profilesRes, athletesRes, membershipsRes] = await Promise.all([
        supabase.from('tenants').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('athletes').select('id', { count: 'exact', head: true }),
        supabase.from('memberships').select('id', { count: 'exact', head: true }).in('status', ['ACTIVE', 'APPROVED']),
      ]);
      
      return {
        activeTenants: tenantsRes.count || 0,
        totalUsers: profilesRes.count || 0,
        totalAthletes: athletesRes.count || 0,
        activeMemberships: membershipsRes.count || 0,
      };
    },
    enabled: isGlobalSuperadmin,
  });

  // Fetch billing data for all tenants
  const { data: billingData } = useQuery({
    queryKey: ['admin-billing'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_billing')
        .select('id, tenant_id, status, current_period_end, is_manual_override, override_at');
      
      if (error) throw error;
      
      // Create a map by tenant_id
      const billingMap = new Map<string, TenantBilling>();
      (data || []).forEach((b) => {
        billingMap.set(b.tenant_id, b as TenantBilling);
      });
      return billingMap;
    },
    enabled: isGlobalSuperadmin,
  });

  // Fetch billing metrics for admin dashboard
  const { data: billingMetrics } = useQuery({
    queryKey: ['admin-billing-metrics'],
    queryFn: async () => {
      // Get billing status counts
      const { data: billingStats, error: billingError } = await supabase
        .from('tenant_billing')
        .select('status');
      
      if (billingError) throw billingError;

      const statusCounts = {
        trialing: 0,
        active: 0,
        withIssues: 0,
      };

      (billingStats || []).forEach((b) => {
        if (b.status === 'TRIALING') statusCounts.trialing++;
        else if (b.status === 'ACTIVE') statusCounts.active++;
        else if (['PAST_DUE', 'UNPAID', 'CANCELED', 'INCOMPLETE'].includes(b.status)) {
          statusCounts.withIssues++;
        }
      });

      // Get monthly revenue from paid invoices this month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const { data: invoices, error: invoicesError } = await supabase
        .from('tenant_invoices')
        .select('amount_cents, currency')
        .eq('status', 'paid')
        .gte('paid_at', startOfMonth.toISOString());

      if (invoicesError) throw invoicesError;

      const monthlyRevenue = (invoices || []).reduce((sum, inv) => sum + (inv.amount_cents || 0), 0);

      return {
        ...statusCounts,
        monthlyRevenue,
      };
    },
    enabled: isGlobalSuperadmin,
  });

  // Toggle tenant active status
  const toggleTenantMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('tenants')
        .update({ is_active: isActive })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success(t('admin.statusUpdated'));
    },
    onError: (error) => {
      toast.error(t('admin.updateError'));
      logger.error(error);
    },
  });

  // Removed local formatAdminDate - using formatDate from formatters.ts
  // Removed local formatAdminCurrency - using formatCurrency from formatters.ts

  const statCards = [
    { labelKey: 'admin.activeOrgs' as const, value: stats?.activeTenants || 0, icon: Building2, color: 'text-primary' },
    { labelKey: 'admin.totalUsers' as const, value: stats?.totalUsers || 0, icon: Users, color: 'text-info' },
    { labelKey: 'admin.registeredAthletes' as const, value: stats?.totalAthletes || 0, icon: Activity, color: 'text-success' },
    { labelKey: 'admin.activeMemberships' as const, value: stats?.activeMemberships || 0, icon: Calendar, color: 'text-warning' },
  ];

  const billingCards = [
    { labelKey: 'admin.tenantsTrialing', value: billingMetrics?.trialing || 0, icon: Clock, color: 'text-info' },
    { labelKey: 'admin.tenantsActive', value: billingMetrics?.active || 0, icon: TrendingUp, color: 'text-success' },
    { labelKey: 'admin.tenantsWithIssues', value: billingMetrics?.withIssues || 0, icon: AlertTriangle, color: 'text-destructive' },
    { labelKey: 'admin.monthlyRevenue', value: formatCurrency(billingMetrics?.monthlyRevenue || 0, locale), icon: CreditCard, color: 'text-primary', isText: true },
  ];

  if (authLoading) {
    return <LoadingState titleKey="common.loading" variant="fullscreen" />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-3">
            <img src={iconLogo} alt="TATAME" className="h-10 w-10 rounded-xl object-contain" />
            <div>
              <h1 className="font-display text-lg font-bold">{t('admin.title')}</h1>
              <p className="text-xs text-muted-foreground">{t('admin.globalPanel')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Language selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Globe className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {AVAILABLE_LOCALES.map((loc) => (
                  <DropdownMenuItem
                    key={loc.code}
                    onClick={() => setLocale(loc.code)}
                    className="flex items-center justify-between"
                  >
                    {loc.label}
                    {locale === loc.code && <Check className="h-4 w-4 ml-2" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Theme selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  {resolvedTheme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme('light')} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Sun className="h-4 w-4" />
                    {t('theme.light')}
                  </span>
                  {theme === 'light' && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Moon className="h-4 w-4" />
                    {t('theme.dark')}
                  </span>
                  {theme === 'dark' && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    {t('theme.system')}
                  </span>
                  {theme === 'system' && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Help button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => navigate('/help')}>
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('nav.help')}</TooltipContent>
            </Tooltip>

            <span className="text-sm text-muted-foreground ml-2 hidden sm:inline">{currentUser?.email}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('admin.logout')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <PostLoginInstitutionalBanner />
          <InstitutionalEnvironmentStatus />
          <div className="mb-8">
            <h2 className="font-display text-3xl font-bold mb-2">
              {t('admin.globalAdminPanel')}
            </h2>
            <p className="text-muted-foreground">
              {t('admin.globalAdminDesc')}
            </p>
          </div>

          {/* === Section 1: Governance & Observability === */}
          <div className="mb-8">
            <Card 
              className="card-hover cursor-pointer" 
              onClick={() => navigate('/admin/health')}
            >
              <CardHeader className="flex flex-row items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-success" />
                </div>
                <div>
                  <CardTitle className="text-base">{t('admin.platformHealth')}</CardTitle>
                  <CardDescription>{t('admin.platformHealthDesc')}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </div>

          {/* === Section 2: Institutional Overview === */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statCards.map((stat, index) => (
              <motion.div
                key={stat.labelKey}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {t(stat.labelKey)}
                    </CardTitle>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-display font-bold">
                      {formatNumber(stat.value, locale)}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* === Section 3: Billing Overview === */}
          <div className="mb-8">
            <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t('admin.billingMetrics')}
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {billingCards.map((card, index) => (
                <motion.div
                  key={card.labelKey}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.4 + index * 0.1 }}
                >
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {t(card.labelKey)}
                      </CardTitle>
                      <card.icon className={`h-5 w-5 ${card.color}`} />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-display font-bold">
                        {card.isText ? card.value : formatNumber(card.value as number, locale)}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>

          {/* === Section 3.5: Conversion Analytics === */}
          <div className="mb-8">
            <Card 
              className="card-hover cursor-pointer" 
              onClick={() => navigate('/admin/analytics/membership')}
            >
              <CardHeader className="flex flex-row items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">Analytics de Conversão</CardTitle>
                  <CardDescription>Visualize o funil completo de filiação e identifique pontos de abandono.</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </div>

          {/* === Section 4: Institutional Config === */}
          <Card 
            className="mb-8 card-hover cursor-pointer" 
            onClick={() => navigate('/admin/landing')}
          >
            <CardHeader className="flex flex-row items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Image className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">{t('admin.landing.title')}</CardTitle>
                <CardDescription>{t('admin.landing.cardDesc')}</CardDescription>
              </div>
            </CardHeader>
          </Card>



          {/* Tenants em Override Manual */}
          {billingData && (() => {
            const tenantsInOverride = tenants?.filter(t => {
              const billing = billingData.get(t.id);
              return billing?.is_manual_override === true;
            }) || [];
            
            if (tenantsInOverride.length === 0) return null;
            
            return (
              <Card className="mb-8 border-destructive/50 bg-destructive/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    {t('admin.tenantsInOverride')} ({tenantsInOverride.length})
                  </CardTitle>
                  <CardDescription>
                    {t('admin.tenantsInOverrideDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {tenantsInOverride.map(tenant => {
                      const billing = billingData.get(tenant.id);
                      
                      // Blindagem contra data inválida
                      const overrideAt = billing?.override_at ? new Date(billing.override_at) : null;
                      const overrideDays = overrideAt && !isNaN(overrideAt.getTime())
                        ? Math.floor((Date.now() - overrideAt.getTime()) / 86400000)
                        : null;
                      
                      return (
                        <div key={tenant.id} className="flex items-center justify-between p-3 rounded-lg bg-background border">
                          <div className="flex items-center gap-3">
                            <div 
                              className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                              style={{ backgroundColor: tenant.primary_color || '#dc2626' }}
                            >
                              {tenant.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium">{tenant.name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <StatusBadge status={billingStatusMap[billing?.status || ''] || 'neutral'} size="sm" />
                                {overrideDays !== null && (
                                  <span className={overrideDays > 30 ? 'text-destructive font-medium' : overrideDays > 7 ? 'text-yellow-600' : ''}>
                                    {t('admin.daysAgo').replace('{days}', String(overrideDays))}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => navigate(`/admin/tenants/${tenant.id}/control`)}
                          >
                            <Shield className="h-4 w-4 mr-2" />
                            {t('admin.actions.controlTower')}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    {t('admin.organizations')}
                  </CardTitle>
                  <CardDescription>
                    {t('admin.organizationsDesc')}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t('admin.update')}
                  </Button>
                  <CreateTenantDialog />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {tenantsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : tenants && tenants.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('admin.table.organization')}</TableHead>
                        <TableHead>{t('admin.table.slug')}</TableHead>
                        <TableHead>{t('admin.table.modalities')}</TableHead>
                        <TableHead>{t('admin.table.billing')}</TableHead>
                        <TableHead>{t('admin.table.createdAt')}</TableHead>
                        <TableHead>{t('admin.table.status')}</TableHead>
                        <TableHead className="text-right">{t('admin.table.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tenants.map((tenant) => (
                        <TableRow key={tenant.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div 
                                className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                                style={{ backgroundColor: tenant.primary_color || '#dc2626' }}
                              >
                                {tenant.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium">{tenant.name}</p>
                                {tenant.description && (
                                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    {tenant.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <code className="text-sm bg-muted px-2 py-1 rounded">
                              /{tenant.slug}
                            </code>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {tenant.sport_types?.slice(0, 3).map((sport) => (
                                <Badge key={sport} variant="outline" className="text-xs">
                                  {sport}
                                </Badge>
                              ))}
                              {tenant.sport_types && tenant.sport_types.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{tenant.sport_types.length - 3}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const billing = billingData?.get(tenant.id);
                              if (!billing) {
                                return (
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="text-xs"
                                    onClick={() => setBillingTenant(tenant)}
                                  >
                                    <CreditCard className="h-3 w-3 mr-1" />
                                    Configurar
                                  </Button>
                                );
                              }
                              const statusType = billingStatusMap[billing.status] || 'neutral';
                              return (
                                <button
                                  onClick={() => setBillingTenant(tenant)}
                                  className="hover:opacity-80 cursor-pointer flex items-center gap-1"
                                >
                                  <StatusBadge status={statusType} size="sm" />
                                  {billing.is_manual_override && (
                                    <Badge variant="destructive" className="text-xs">
                                      {t('admin.status.manual')}
                                      {(() => {
                                        const overrideAt = billing.override_at ? new Date(billing.override_at) : null;
                                        const days = overrideAt && !isNaN(overrideAt.getTime())
                                          ? Math.floor((Date.now() - overrideAt.getTime()) / 86400000)
                                          : null;
                                        return days !== null && days > 0 ? ` (${days}d)` : '';
                                      })()}
                                    </Badge>
                                  )}
                                </button>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(tenant.created_at, locale)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={tenant.is_active}
                                onCheckedChange={(checked) => 
                                  toggleTenantMutation.mutate({ id: tenant.id, isActive: checked })
                                }
                                disabled={toggleTenantMutation.isPending}
                              />
                              <span className={`text-xs ${tenant.is_active ? 'text-success' : 'text-muted-foreground'}`}>
                                {tenant.is_active ? t('admin.status.active') : t('admin.status.inactive')}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  {t('admin.table.actions')}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => window.open(`/${tenant.slug}`, '_blank')}>
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  {t('admin.actions.openPortal')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setImpersonatingTenant(tenant)}>
                                  <Shield className="h-4 w-4 mr-2" />
                                  {t('impersonation.startButton')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setEditingTenant(tenant)}>
                                  <Edit2 className="h-4 w-4 mr-2" />
                                  {t('admin.actions.edit')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setManagingAdminsTenant(tenant)}>
                                  <UserCog className="h-4 w-4 mr-2" />
                                  {t('admin.actions.manageAdmins')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/admin/tenants/${tenant.id}/control`)}>
                                  <Shield className="h-4 w-4 mr-2" />
                                  {t('admin.actions.controlTower')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">{t('admin.noOrganizations')}</p>
                  <CreateTenantDialog />
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>

      {/* Edit tenant dialog */}
      {editingTenant && (
        <EditTenantDialog
          tenant={editingTenant}
          open={!!editingTenant}
          onOpenChange={(open) => !open && setEditingTenant(null)}
        />
      )}

      {/* Manage admins dialog */}
      {managingAdminsTenant && (
        <ManageAdminsDialog
          tenant={managingAdminsTenant}
          open={!!managingAdminsTenant}
          onOpenChange={(open) => !open && setManagingAdminsTenant(null)}
        />
      )}

      {/* Billing dialog */}
      {billingTenant && (
        <TenantBillingDialog
          tenant={billingTenant}
          open={!!billingTenant}
          onOpenChange={(open) => !open && setBillingTenant(null)}
        />
      )}

      {/* Impersonation dialog */}
      {impersonatingTenant && (
        <StartImpersonationDialog
          tenant={impersonatingTenant}
          open={!!impersonatingTenant}
          onOpenChange={(open) => !open && setImpersonatingTenant(null)}
        />
      )}
    </div>
  );
}
