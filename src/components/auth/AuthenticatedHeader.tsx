/**
 * 🔐 AUTHENTICATED HEADER — Lightweight header for authenticated pages
 * 
 * Used on pages that don't use AppShell or PortalLayout but require
 * a consistent header with logout functionality.
 * 
 * Features:
 * - Logo (tenant or TATAME)
 * - Theme toggle
 * - User dropdown with Logout
 * - Respects ImpersonationBanner (z-index 40, below banner's 50)
 */
import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LogOut, Sun, Moon, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/contexts/I18nContext';
import iconLogo from '@/assets/iconLogo.png';

interface AuthenticatedHeaderProps {
  tenantName?: string;
  tenantLogo?: string | null;
  tenantSlug?: string;
}

export function AuthenticatedHeader({
  tenantName,
  tenantLogo,
  tenantSlug: propTenantSlug,
}: AuthenticatedHeaderProps) {
  const { currentUser, isAuthenticated, signOut } = useCurrentUser();
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { tenantSlug: paramTenantSlug } = useParams();

  // Use prop if provided, fallback to route param
  const tenantSlug = propTenantSlug || paramTenantSlug;

  // Don't render if not authenticated
  if (!isAuthenticated) return null;

  const handleLogout = async () => {
    await signOut();
    navigate(tenantSlug ? `/${tenantSlug}` : '/login');
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container max-w-4xl mx-auto flex h-14 items-center justify-between px-4">
        {/* Logo */}
        <Link
          to={tenantSlug ? `/${tenantSlug}` : '/'}
          className="flex items-center gap-2"
        >
          {tenantLogo ? (
            <img
              src={tenantLogo}
              alt={tenantName || ''}
              className="h-8 w-8 rounded object-cover"
            />
          ) : (
            <img
              src={iconLogo}
              alt="TATAME"
              className="h-8 w-8 rounded object-contain"
            />
          )}
          {tenantName && (
            <span className="font-semibold text-sm hidden sm:inline">
              {tenantName}
            </span>
          )}
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label={t('nav.toggleTheme')}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

          {/* User menu with logout */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline text-sm max-w-[100px] truncate">
                  {currentUser?.name || currentUser?.email?.split('@')[0]}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t('nav.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
