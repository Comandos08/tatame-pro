/**
 * 🔧 HeaderSettingsDropdown — Consolidated settings menu for header
 * 
 * Combines: Theme, Language, Help into a single dropdown
 * P-MENU-01: UX Cleanup
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Globe, Sun, Moon, Monitor, HelpCircle, Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n, Locale } from '@/contexts/I18nContext';
import { useTenant } from '@/contexts/TenantContext';

export function HeaderSettingsDropdown() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  
  const tenantSlug = tenant?.slug || '';

  const languages: { code: Locale; label: string }[] = [
    { code: 'pt-BR', label: t('language.ptBR') },
    { code: 'en', label: t('language.en') },
    { code: 'es', label: t('language.es') },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Settings className="h-5 w-5" />
          <span className="sr-only">{t('settings.title')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {/* Language submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Globe className="mr-2 h-4 w-4" />
            {t('language.select')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {languages.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onClick={() => setLocale(lang.code)}
                className="flex items-center justify-between cursor-pointer"
              >
                {lang.label}
                {locale === lang.code && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Theme submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {resolvedTheme === 'dark' ? (
              <Moon className="mr-2 h-4 w-4" />
            ) : (
              <Sun className="mr-2 h-4 w-4" />
            )}
            {t('theme.select')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              onClick={() => setTheme('light')}
              className="flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Sun className="h-4 w-4" />
                {t('theme.light')}
              </span>
              {theme === 'light' && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme('dark')}
              className="flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Moon className="h-4 w-4" />
                {t('theme.dark')}
              </span>
              {theme === 'dark' && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme('system')}
              className="flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Monitor className="h-4 w-4" />
                {t('theme.system')}
              </span>
              {theme === 'system' && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {/* Help link */}
        <DropdownMenuItem 
          onClick={() => navigate(`/${tenantSlug}/app/help`)}
          className="cursor-pointer"
        >
          <HelpCircle className="mr-2 h-4 w-4" />
          {t('nav.help')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
