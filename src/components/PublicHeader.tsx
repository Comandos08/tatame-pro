import React from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, Globe, ArrowLeft, ArrowRight, Trophy, Shield } from 'lucide-react';
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
  const { resolvedTheme, setTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

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

            {/* Theme Toggle */}
            <Button variant="ghost" size="icon" onClick={toggleTheme} title={resolvedTheme === 'dark' ? t('theme.light') : t('theme.dark')}>
              {resolvedTheme === 'dark' ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>

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
              <div 
                className="h-10 w-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                <Shield className="h-6 w-6 text-white" />
              </div>
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

          {/* Theme Toggle */}
          <Button variant="ghost" size="icon" onClick={toggleTheme} title={resolvedTheme === 'dark' ? t('theme.light') : t('theme.dark')}>
            {resolvedTheme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>

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
              <Link to={`/${tenant.slug}/app`}>
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
