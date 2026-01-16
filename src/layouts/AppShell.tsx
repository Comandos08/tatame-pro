import React, { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Home, 
  Users, 
  Award, 
  Settings, 
  LogOut, 
  Menu,
  X,
  Shield,
  Building2,
  Sun,
  Moon,
  HelpCircle,
  Globe,
  FileText,
  CheckCircle,
  Trophy,
  CreditCard,
  UserCircle
} from 'lucide-react';
import logoIppon from '@/assets/logoIppon.png';
import { useState } from 'react';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n, Locale } from '@/contexts/I18nContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentUser, signOut, isGlobalSuperadmin, hasRole } = useCurrentUser();
  const { tenant } = useTenant();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const tenantSlug = tenant?.slug || '';
  
  // Check if user has admin roles for billing visibility
  const hasAdminRole = tenant?.id && (
    hasRole('ADMIN_TENANT', tenant.id) || hasRole('STAFF_ORGANIZACAO', tenant.id)
  );
  
  const navigation = [
    { name: t('nav.athleteArea'), href: `/${tenantSlug}/app/me`, icon: UserCircle },
    { name: t('nav.dashboard'), href: `/${tenantSlug}/app`, icon: Home },
    { name: t('nav.athletes'), href: `/${tenantSlug}/app/athletes`, icon: Users },
    { name: t('nav.memberships'), href: `/${tenantSlug}/app/memberships`, icon: Shield },
    { name: t('nav.academies'), href: `/${tenantSlug}/app/academies`, icon: Building2 },
    { name: t('nav.coaches'), href: `/${tenantSlug}/app/coaches`, icon: Award },
    { name: t('nav.gradings'), href: `/${tenantSlug}/app/grading-schemes`, icon: Award },
    { name: t('nav.approvals'), href: `/${tenantSlug}/app/approvals`, icon: Settings },
    { name: t('nav.rankings'), href: `/${tenantSlug}/app/rankings`, icon: Trophy },
    { name: t('nav.auditLog'), href: `/${tenantSlug}/app/audit-log`, icon: FileText },
    ...(hasAdminRole || isGlobalSuperadmin ? [{ name: t('billing.title'), href: `/${tenantSlug}/app/billing`, icon: CreditCard }] : []),
    { name: t('nav.settings'), href: `/${tenantSlug}/app/settings`, icon: Settings },
  ];

  const languages: { code: Locale; label: string }[] = [
    { code: 'pt-BR', label: t('language.ptBR') },
    { code: 'en', label: t('language.en') },
    { code: 'es', label: t('language.es') },
  ];

  return (
    <div className="min-h-screen bg-background">
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
                  src={logoIppon} 
                  alt="IPPON" 
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

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            ))}
            
            {/* Help link */}
            <Link
              to={`/${tenantSlug}/app/help`}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <HelpCircle className="h-5 w-5" />
              <span>{t('nav.help')}</span>
            </Link>
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
                    <Shield className="mr-2 h-4 w-4" />
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
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          <div className="flex-1" />

          {/* Language selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Globe className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('language.select')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {languages.map((lang) => (
                <DropdownMenuItem 
                  key={lang.code} 
                  onClick={() => setLocale(lang.code)}
                  className="flex items-center justify-between"
                >
                  {lang.label}
                  {locale === lang.code && <CheckCircle className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Theme toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {resolvedTheme === 'dark' ? t('theme.light') : t('theme.dark')}
            </TooltipContent>
          </Tooltip>

          {/* Help */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(`/${tenantSlug}/app/help`)}
              >
                <HelpCircle className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('nav.help')}</TooltipContent>
          </Tooltip>
          
          {tenant && (
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span>{tenant.sportTypes.join(', ')}</span>
            </div>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6">
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
