import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Trophy } from 'lucide-react';
import iconLogo from '@/assets/iconLogo.png';
import logoTatameLight from '@/assets/logoTatameLight.png';
import logoTatameDark from '@/assets/logoTatameDark.png';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/contexts/I18nContext';

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

export default function PublicHeader({ tenant, showBackButton, backTo }: PublicHeaderProps) {
  const { resolvedTheme } = useTheme();
  const { t } = useI18n();

  // MODE 1: TATAME HOME (no tenant)
  if (!tenant) {
    return (
      <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-full items-center justify-between px-4">
          {/* LEFT — Brand */}
          <Link to="/" className="flex items-center">
            <img 
              src={resolvedTheme === 'dark' ? logoTatameDark : logoTatameLight} 
              alt="TATAME" 
              className="h-8 w-auto object-contain" 
            />
          </Link>

          {/* RIGHT — Navigation + CTAs */}
          <nav className="flex items-center gap-2">
            {/* Link: Sobre (desktop only) */}
            <Button variant="ghost" size="sm" className="hidden md:flex" asChild>
              <Link to="/about">{t('nav.about')}</Link>
            </Button>

            {/* CTA: Entrar (ALWAYS visible - mobile-first) */}
            <Button variant="outline" size="sm" asChild>
              <Link to="/login">{t('auth.login')}</Link>
            </Button>

            {/* CTA: Acessar Plataforma (primary, desktop) */}
            <Button size="sm" className="hidden sm:flex" asChild>
              <Link to="/login">
                {t('landing.accessPlatform')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>
    );
  }

  // MODE 2: TENANT PAGES
  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-full items-center justify-between px-4">
        {/* LEFT — Brand */}
        <Link to={`/${tenant.slug}`} className="flex items-center gap-2">
          {tenant.logoUrl ? (
            <img src={tenant.logoUrl} alt={tenant.name} className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            <img src={iconLogo} alt={tenant.name} className="h-8 w-8 rounded-lg object-contain" />
          )}
          <span className="font-display text-base font-semibold truncate max-w-[150px] sm:max-w-none">
            {tenant.name}
          </span>
        </Link>

        {/* RIGHT — Navigation OR Back Button (MUTUALLY EXCLUSIVE) */}
        <nav className="flex items-center gap-2">
          {showBackButton ? (
            // BACK MODE: Only back button, NO other CTAs
            <Button variant="outline" size="sm" asChild>
              <Link to={backTo || `/${tenant.slug}`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('common.back')}
              </Link>
            </Button>
          ) : (
            // NAVIGATION MODE: Full navigation
            <>
              {/* Link: Eventos (desktop) */}
              <Button variant="ghost" size="sm" className="hidden sm:flex" asChild>
                <Link to={`/${tenant.slug}/events`}>{t('nav.events')}</Link>
              </Button>

              {/* Link: Rankings (TENANT ONLY, ghost + icon) */}
              <Button variant="ghost" size="sm" className="hidden md:flex" asChild>
                <Link to={`/${tenant.slug}/rankings`}>
                  <Trophy className="mr-2 h-4 w-4" />
                  Rankings
                </Link>
              </Button>

              {/* CTA: Entrar (ALWAYS visible - mobile-first) */}
              <Button variant="outline" size="sm" asChild>
                <Link to={`/${tenant.slug}/login`}>{t('auth.login')}</Link>
              </Button>

              {/* CTA: Acessar Portal (primary) */}
              <Button size="sm" className="hidden sm:flex" asChild>
                <Link to={`/${tenant.slug}/portal`}>
                  {t('nav.accessPortal')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
