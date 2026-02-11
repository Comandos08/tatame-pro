/**
 * 🏠 AppShell — Main authenticated layout with sidebar and header
 * 
 * P-MENU-01: Reorganized header with tenant context, consolidated settings dropdown,
 * and quick create action. Reduced from 345 to ~310 lines via component extraction.
 */
import React, { ReactNode, useState, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { motion } from 'framer-motion';
import { 
  Home, 
  Users, 
  Award, 
  Settings, 
  LogOut, 
  Menu,
  X,
  Building2,
  HelpCircle,
  FileText,
  Trophy,
  CreditCard,
  UserCircle,
  UserCheck,
  Calendar,
  Shield,
  Plus
} from 'lucide-react';
import iconLogo from '@/assets/iconLogo.png';
import logoTatameLight from '@/assets/logoTatameLight.png';
import logoTatameDark from '@/assets/logoTatameDark.png';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/contexts/I18nContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useAccessContract } from '@/hooks/useAccessContract';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TenantStatusBanner } from '@/components/tenant/TenantStatusBanner';
import { SystemAwarenessBanner } from '@/components/institutional/SystemAwarenessBanner';
import { HeaderSettingsDropdown, HeaderUserMenu } from '@/components/layout';
import { CreateEventDialog } from '@/components/events/CreateEventDialog';
import { assertTenantLifecycleState } from '@/domain/tenant/normalize';
import { normalizeBillingState, deriveBillingViewState } from '@/domain/billing/normalizeBillingUx';
import { deriveReportMode, normalizeAnalyticsViewState } from '@/domain/reports/normalize';
import { 
  isReportsRoute as checkIsReportsRoute, 
  normalizeReportsViewState, 
  deriveActiveReportType 
} from '@/domain/reports/normalizeReports';
import { normalizeExportViewState, isExportRoute } from '@/domain/exports/normalize';
import { isAnalyticsRoute, deriveActiveMetrics, normalizeAnalyticsViewState as normalizeAnalyticsState } from '@/domain/analytics/normalize';
import { normalizeAuditViewState } from '@/domain/audit/normalize';
import { useTenantStatus } from '@/hooks/useTenantStatus';
import { resolveUXPersona } from '@/lib/ux/resolveUXPersona';
import type { FeatureKey } from '@/hooks/useAccessContract';
interface AppShellProps {
  children: ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  feature?: FeatureKey;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentUser, signOut, isGlobalSuperadmin } = useCurrentUser();
  const { tenant } = useTenant();
  const { resolvedTheme } = useTheme();
  const { t } = useI18n();
  const { isImpersonating, session: impersonationSession, isLoading: impersonationLoading, resolutionStatus } = useImpersonation();
  const { can } = useAccessContract(tenant?.id);
  const { billingStatus } = useTenantStatus();
  const navigate = useNavigate();
  const location = useLocation();

  // 🔐 HARDENED: Logout goes to /portal which will redirect to /login if needed
  const handleSignOut = async () => {
    await signOut();
    navigate('/portal');
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const tenantSlug = tenant?.slug || '';
  
  // 🔐 Navigation items with feature-based access control
  const allNavigation: NavItem[] = [
    { name: t('nav.athleteArea'), href: `/${tenantSlug}/app/me`, icon: UserCircle, feature: 'TENANT_MY_AREA' },
    { name: t('nav.dashboard'), href: `/${tenantSlug}/app`, icon: Home, feature: 'TENANT_APP' },
    { name: t('nav.athletes'), href: `/${tenantSlug}/app/athletes`, icon: Users, feature: 'TENANT_ATHLETES' },
    { name: t('nav.memberships'), href: `/${tenantSlug}/app/memberships`, icon: UserCheck, feature: 'TENANT_MEMBERSHIPS' },
    { name: t('nav.academies'), href: `/${tenantSlug}/app/academies`, icon: Building2, feature: 'TENANT_ACADEMIES' },
    { name: t('nav.coaches'), href: `/${tenantSlug}/app/coaches`, icon: Award, feature: 'TENANT_COACHES' },
    { name: t('nav.gradings'), href: `/${tenantSlug}/app/grading-schemes`, icon: Award, feature: 'TENANT_GRADINGS' },
    { name: t('nav.approvals'), href: `/${tenantSlug}/app/approvals`, icon: Settings, feature: 'TENANT_APPROVALS' },
    { name: t('nav.rankings'), href: `/${tenantSlug}/app/rankings`, icon: Trophy, feature: 'TENANT_RANKINGS' },
    { name: t('nav.events'), href: `/${tenantSlug}/app/events`, icon: Calendar, feature: 'TENANT_EVENTS' },
    { name: t('nav.auditLog'), href: `/${tenantSlug}/app/audit-log`, icon: FileText, feature: 'TENANT_AUDIT_LOG' },
    { name: t('nav.security'), href: `/${tenantSlug}/app/security`, icon: Shield, feature: 'TENANT_SECURITY' },
    { name: t('billing.title'), href: `/${tenantSlug}/app/billing`, icon: CreditCard, feature: 'TENANT_BILLING' },
    { name: t('nav.settings'), href: `/${tenantSlug}/app/settings`, icon: Settings, feature: 'TENANT_SETTINGS' },
    { name: t('nav.help'), href: `/${tenantSlug}/app/help`, icon: HelpCircle, feature: 'TENANT_HELP' },
  ];
  
  // 🔐 Filter navigation based on permissions (UX only - guards still enforce)
  const navigation = allNavigation.filter(item => {
    if (!item.feature) return true;
    return can(item.feature);
  });

  // SAFE GOLD: Derive deterministic view state for E2E instrumentation
  const impersonationViewState = impersonationLoading || resolutionStatus === 'RESOLVING'
    ? 'LOADING'
    : resolutionStatus === 'RESOLVED' || !impersonationLoading
      ? 'READY'
      : 'ERROR';
  
  const impersonationState = isImpersonating ? 'ON' : 'OFF';

  // SAFE GOLD T1.0: Derive tenant lifecycle state deterministically
  const tenantLifecycleState = assertTenantLifecycleState(tenant?.status);

  // ADMIN SAFE GOLD A1.0: route-based deterministic mode
  const pathname = location.pathname;
  const adminMode = pathname.includes('/admin') ? 'ON' : 'OFF';

  // C1 SAFE GOLD: Derive UX persona from route (purely declarative, no access logic)
  const uxPersona = useMemo(() => resolveUXPersona(pathname), [pathname]);

  // ADMIN SAFE GOLD A1.0: derive deterministic view state (no business logic)
  const adminViewState =
    adminMode === 'ON'
      ? (impersonationLoading || resolutionStatus === 'RESOLVING' ? 'LOADING' : 'READY')
      : 'READY';

  // ADMIN SAFE GOLD A1.0: best-effort role read from existing role signals (fail-safe to NONE)
  // NOTE: This is instrumentation only; does not change behavior.
  const adminRole = isGlobalSuperadmin
    ? 'SUPERADMIN_GLOBAL'
    : 'NONE';

  // BILLING UX SAFE GOLD B2.0: derive billing state deterministically
  const billingState = normalizeBillingState(billingStatus);
  const billingViewState = deriveBillingViewState(billingState);

  // REPORTS SAFE GOLD REPORTS1.0: derive report mode and view state deterministically
  const isReportsRoute = pathname.includes('/reports') || pathname.includes('/analytics') || pathname.includes('/dashboard');
  const reportMode = deriveReportMode(tenant?.id, isGlobalSuperadmin && !tenant?.id);
  const reportViewState = normalizeAnalyticsViewState(isReportsRoute ? { ready: true } : null);

  // REPORTS1.0 SAFE GOLD: New reports instrumentation
  const isOnReportsRoute = checkIsReportsRoute(pathname);
  const reportsViewState = normalizeReportsViewState(isOnReportsRoute ? { ready: true } : null);
  const reportsType = deriveActiveReportType(pathname);
  const reportsContext = isOnReportsRoute ? 'ACTIVE' : '';

  // EXPORTS SAFE GOLD EXPORTS1.0: derive export state deterministically
  const isOnExportRoute = isExportRoute(pathname);
  const exportViewState = normalizeExportViewState(isOnExportRoute ? 'READY' : null);
  const exportType = isOnExportRoute ? (pathname.includes('/pdf') ? 'PDF' : 'CSV') : '';

  // ANALYTICS SAFE GOLD ANALYTICS2.0: derive analytics state deterministically
  const isOnAnalyticsRoute = isAnalyticsRoute(pathname);
  const analyticsViewState = normalizeAnalyticsState(isOnAnalyticsRoute ? { ready: true } : null);
  const analyticsMetrics = deriveActiveMetrics(pathname);

  // AUDIT SAFE GOLD AUDIT2.0: derive audit state deterministically
  const isAuditRoute = pathname.includes('/audit');
  const auditViewState = normalizeAuditViewState(isAuditRoute ? { ready: true } : null);
  const auditEntity = isAuditRoute ? 'TENANT' : '';
  const auditLevel = 'INFO';

  return (
    <div 
      className="min-h-screen bg-background"
      data-testid="app-shell"
      data-impersonation-state={impersonationState}
      data-impersonation-view-state={impersonationViewState}
      data-tenant-state={tenantLifecycleState}
      data-tenant-id={tenant?.id ?? ''}
      data-admin-mode={adminMode}
      data-admin-view-state={adminViewState}
      data-admin-role={adminRole}
      data-admin-route={pathname}
      data-billing-state={billingState}
      data-billing-view-state={billingViewState}
      data-report-mode={reportMode}
      data-report-view-state={reportViewState}
      data-report-route={isReportsRoute ? pathname : ''}
      data-reports-context={reportsContext}
      data-reports-view-state={reportsViewState}
      data-reports-type={isOnReportsRoute ? reportsType : ''}
      data-reports-route={isOnReportsRoute ? pathname : ''}
      data-export-type={exportType}
      data-export-view-state={exportViewState}
      data-export-route={isOnExportRoute ? pathname : ''}
      data-analytics-view-state={analyticsViewState}
      data-analytics-metrics={analyticsMetrics.join(',')}
      data-analytics-route={isOnAnalyticsRoute ? pathname : ''}
      data-audit-context={isAuditRoute ? 'ACTIVE' : ''}
      data-audit-view-state={auditViewState}
      data-audit-entity={auditEntity}
      data-audit-level={auditLevel}
      data-audit-route={isAuditRoute ? pathname : ''}
    >
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-sidebar-border bg-sidebar transform transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border">
            <Link to={`/${tenantSlug}`} className="flex items-center gap-2">
              {tenant?.logoUrl ? (
                <>
                  <img src={tenant.logoUrl} alt={tenant.name} className="h-8 w-8 rounded-lg object-cover" />
                  <span className="font-display font-bold text-foreground">{tenant.name}</span>
                </>
              ) : (
                <img 
                  src={resolvedTheme === 'dark' ? logoTatameDark : logoTatameLight} 
                  alt="TATAME" 
                  className="h-8 w-auto object-contain" 
                />
              )}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Impersonation context indicator */}
          {isImpersonating && impersonationSession && (
            <div className="mx-4 mb-2 rounded-md bg-yellow-100 dark:bg-yellow-900/30 px-3 py-2 text-xs">
              <span className="text-yellow-800 dark:text-yellow-200 opacity-80">
                {t('impersonation.operatingAs')}:
              </span>
              <strong className="block truncate text-yellow-900 dark:text-yellow-100">
                {impersonationSession.targetTenantName}
              </strong>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === `/${tenantSlug}/app`}
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </NavLink>
            ))}
            
            {/* U20: Help is now in allNavigation array, gated by can('TENANT_HELP') */}
          </nav>

          {/* User menu */}
          <div className="border-t border-sidebar-border p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-sidebar-accent">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={currentUser?.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {getInitials(currentUser?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {currentUser?.name || 'Usuário'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {currentUser?.email}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{t('nav.myAccount')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isGlobalSuperadmin && (
                  <DropdownMenuItem onClick={() => navigate('/admin')}>
                    <img src={iconLogo} alt="Admin" className="mr-2 h-4 w-4 rounded object-contain" />
                    {t('nav.globalAdmin')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('nav.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Header — P-MENU-01: Reorganized with tenant context and consolidated menus */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
          {/* LEFT: Context */}
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            
            {/* Tenant name (desktop only, since sidebar shows on lg) */}
            <div className="hidden lg:flex items-center gap-2">
              {tenant?.logoUrl && (
                <img 
                  src={tenant.logoUrl} 
                  alt="" 
                  className="h-6 w-6 rounded object-cover" 
                />
              )}
              <span className="text-sm font-medium text-foreground truncate max-w-[180px]">
                {tenant?.name}
              </span>
            </div>
            
            {/* C3: Redundant impersonation badge — always visible for superadmin */}
            {isImpersonating && (
              <Badge 
                variant="outline" 
                className="text-xs font-bold border-warning/50 bg-warning/10 text-warning-foreground dark:text-warning uppercase tracking-wider"
                data-testid="impersonation-header-badge"
              >
                {t('impersonation.badge')}
              </Badge>
            )}

            {/* C1: UX Persona context label — read-only, non-interactive */}
            <span 
              className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              data-testid="ux-persona-label"
              data-ux-persona={uxPersona}
            >
              <span className="opacity-60">—</span>
              {uxPersona === 'ADMIN' 
                ? t('ux.contextAdmin') 
                : t('ux.contextAthlete')
              }
            </span>
          </div>
          
          {/* SPACER */}
          <div className="flex-1" />
          
          {/* RIGHT: Actions */}
          <div className="flex items-center gap-1">
            {/* Quick Create Event (admin, desktop) */}
            {can('TENANT_EVENTS') && (
              <CreateEventDialog>
                <Button size="sm" variant="default" className="hidden md:flex gap-2">
                  <Plus className="h-4 w-4" />
                  <span>{t('events.createEvent')}</span>
                </Button>
              </CreateEventDialog>
            )}
            
            {/* Settings dropdown (Theme + Language + Help) */}
            <HeaderSettingsDropdown />
            
            {/* User menu */}
            <HeaderUserMenu />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6">
          {/* PI U18: System self-awareness banner */}
          <SystemAwarenessBanner />
          {/* Tenant Status Banner - shows trial/billing warnings */}
          <TenantStatusBanner />
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
