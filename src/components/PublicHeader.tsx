import React from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, Monitor, Globe, ArrowLeft, ArrowRight, Trophy, Check } from 'lucide-react';
import iconLogo from '@/assets/iconLogo.png';
import logoTatameLight from '@/assets/logoTatameLight.png';
import logoTatameDark from '@/assets/logoTatameDark.png';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n, Locale } from '@/contexts/I18nContext';

interface Tenant {
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor: string;
}

interface PublicHeaderProps {
  tenant?: Tenant | null;
  showBackButton?: boolean;
  backTo?: string;
}

const localeLabels: Record<Locale, string> = {
  'pt-BR': 'Português',
  'en': 'English',
  'es': 'Español',
};

export default function PublicHeader({ tenant, showBackButton, backTo }: PublicHeaderProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();

  // For IPPON main landing (no tenant)
  if (!tenant) {
    return (
      <header className="relative z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <Link to="/" className="flex items-center">
            <img 
              src={resolvedTheme === 'dark' ? logoTatameDark : logoTatameLight} 
              alt="TATAME" 
              className="h-10 w-auto object-contain" 
            />
          </Link>
          
          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" title={t('language.select')}>
                  <Globe className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(Object.keys(localeLabels) as Locale[]).map((loc) => (
                  <DropdownMenuItem
                    key={loc}
                    onClick={() => setLocale(loc)}
                    className={locale === loc ? 'bg-accent' : ''}
                  >
                    {localeLabels[loc]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Theme Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" title={t('theme.select')}>
                  {resolvedTheme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
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

            {/* Auth Links */}
            <Link to="/login" className="hidden md:block text-muted-foreground hover:text-foreground transition-colors">
              Entrar
            </Link>
            <Button asChild>
              <Link to="/login">Começar Agora</Link>
            </Button>
          </div>
        </div>
      </header>
    );
  }

  // For tenant pages
  return (
    <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
      <div className="container mx-auto flex items-center justify-between py-4 px-4">
        <div className="flex items-center gap-3">
          <Link to={`/${tenant.slug}`} className="flex items-center gap-2">
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.name} className="h-10 w-10 rounded-lg object-cover" />
            ) : (
              <img src={iconLogo} alt={tenant.name} className="h-10 w-10 rounded-lg object-contain" />
            )}
            <span className="font-display text-lg font-bold">{tenant.name}</span>
          </Link>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Rankings Link */}
          {!showBackButton && (
            <Button variant="ghost" size="sm" className="hidden sm:flex" asChild>
              <Link to={`/${tenant.slug}/rankings`}>
                <Trophy className="mr-2 h-4 w-4" />
                Rankings
              </Link>
            </Button>
          )}

          {/* Language Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" title={t('language.select')}>
                <Globe className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(localeLabels) as Locale[]).map((loc) => (
                <DropdownMenuItem
                  key={loc}
                  onClick={() => setLocale(loc)}
                  className={locale === loc ? 'bg-accent' : ''}
                >
                  {localeLabels[loc]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Theme Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" title={t('theme.select')}>
                {resolvedTheme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
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

          {/* Back or CTA */}
          {showBackButton ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={backTo || `/${tenant.slug}`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('common.back')}
              </Link>
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link to={`/${tenant.slug}/portal`}>
                {t('nav.accessPortal')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
