import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Building2, Users, LogOut, Activity, ExternalLink, 
  Loader2, RefreshCw, Sun, Moon, Monitor, Globe, HelpCircle, Check,
  Edit2, UserCog, Calendar, CreditCard, TrendingUp, AlertTriangle, Clock, LogIn
} from 'lucide-react';
import iconLogo from '@/assets/iconLogo.png';
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
import { useI18n, Locale } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CreateTenantDialog } from '@/components/admin/CreateTenantDialog';
import { EditTenantDialog } from '@/components/admin/EditTenantDialog';
import { ManageAdminsDialog } from '@/components/admin/ManageAdminsDialog';
import { TenantBillingDialog } from '@/components/admin/TenantBillingDialog';

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

  React.useEffect(() => {
    if (!authLoading && !isGlobalSuperadmin && currentUser) {
      navigate('/');
    }
  }, [isGlobalSuperadmin, currentUser, navigate, authLoading]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
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
        supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
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
        .select('id, tenant_id, status, current_period_end');
      
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
      toast.success('Status da organização atualizado');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar organização');
      console.error(error);
    },
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const statCards = [
    { label: 'Organizações Ativas', value: stats?.activeTenants || 0, icon: Building2, color: 'text-primary' },
    { label: 'Usuários Totais', value: stats?.totalUsers || 0, icon: Users, color: 'text-info' },
    { label: 'Atletas Cadastrados', value: stats?.totalAthletes || 0, icon: Activity, color: 'text-success' },
    { label: 'Filiações Ativas', value: stats?.activeMemberships || 0, icon: Calendar, color: 'text-warning' },
  ];

  const billingCards = [
    { labelKey: 'admin.tenantsTrialing', value: billingMetrics?.trialing || 0, icon: Clock, color: 'text-info' },
    { labelKey: 'admin.tenantsActive', value: billingMetrics?.active || 0, icon: TrendingUp, color: 'text-success' },
    { labelKey: 'admin.tenantsWithIssues', value: billingMetrics?.withIssues || 0, icon: AlertTriangle, color: 'text-destructive' },
    { labelKey: 'admin.monthlyRevenue', value: `R$ ${((billingMetrics?.monthlyRevenue || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: CreditCard, color: 'text-primary', isText: true },
  ];

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-3">
            <img src={iconLogo} alt="TATAME" className="h-10 w-10 rounded-xl object-contain" />
            <div>
              <h1 className="font-display text-lg font-bold">TATAME Admin</h1>
              <p className="text-xs text-muted-foreground">Painel Global</p>
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
              <TooltipContent>Sair</TooltipContent>
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
          <div className="mb-8">
            <h2 className="font-display text-3xl font-bold mb-2">
              Painel de Administração Global
            </h2>
            <p className="text-muted-foreground">
              Gerencie todas as organizações de esportes de combate da plataforma TATAME.
            </p>
          </div>

          {/* Stats */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statCards.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <Card className="card-hover">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {stat.label}
                    </CardTitle>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-display font-bold">
                      {stat.value.toLocaleString('pt-BR')}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Billing Metrics */}
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
                  <Card className="card-hover">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {t(card.labelKey as any)}
                      </CardTitle>
                      <card.icon className={`h-5 w-5 ${card.color}`} />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-display font-bold">
                        {card.isText ? card.value : (card.value as number).toLocaleString('pt-BR')}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Tenants Table */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Organizações
                  </CardTitle>
                  <CardDescription>
                    Gerencie todas as organizações da plataforma
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar
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
                        <TableHead>Organização</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Modalidades</TableHead>
                        <TableHead>Billing</TableHead>
                        <TableHead>Criado em</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
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
                                  className="hover:opacity-80 cursor-pointer"
                                >
                                  <StatusBadge status={statusType} size="sm" />
                                </button>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(tenant.created_at)}
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
                                {tenant.is_active ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  Ações
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => window.open(`/${tenant.slug}`, '_blank')}>
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  Abrir portal
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => window.open(`/${tenant.slug}/app`, '_blank')}>
                                  <LogIn className="h-4 w-4 mr-2" />
                                  Entrar como admin
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setEditingTenant(tenant)}>
                                  <Edit2 className="h-4 w-4 mr-2" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setManagingAdminsTenant(tenant)}>
                                  <UserCog className="h-4 w-4 mr-2" />
                                  Gerenciar admins
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
                  <p className="text-muted-foreground mb-4">Nenhuma organização encontrada</p>
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
    </div>
  );
}
