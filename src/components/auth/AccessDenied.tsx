/**
 * 🔐 AccessDenied — Permission Error Screen
 * 
 * CONSTRAINTS (per approval):
 * 1. Contextual messaging ONLY — no redirects
 * 2. No side effects
 * 3. No new permission decisions
 * 4. Pure UI component
 * 
 * Displayed when a user is authenticated but lacks the required roles.
 */


import { ShieldX, ArrowLeft, Home, Mail } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/contexts/I18nContext';

interface AccessDeniedProps {
  /** Custom title (optional) - i18n key */
  titleKey?: string;
  /** Custom description (optional) - i18n key */
  descriptionKey?: string;
}

/**
 * Resolves contextual access denied messaging based on current route.
 * 
 * CONSTRAINT: This is MESSAGING ONLY — no permission decisions.
 * The actual access control is handled by IdentityGate/RequireRoles.
 */
function useAccessDeniedContext() {
  const location = useLocation();
  const pathname = location.pathname;

  // Superadmin area (/admin/*)
  if (pathname.startsWith('/admin')) {
    return {
      descriptionKey: 'accessDenied.superadminArea',
      suggestionKey: 'accessDenied.superadminSuggestion',
      showContactAdmin: false,
      showMembership: false,
      homeRoute: '/portal',
    };
  }

  // Tenant admin area (/:slug/app/*)
  if (pathname.includes('/app/') && !pathname.includes('/portal')) {
    return {
      descriptionKey: 'accessDenied.adminArea',
      suggestionKey: 'accessDenied.adminSuggestion',
      showContactAdmin: true,
      showMembership: false,
      homeRoute: '/portal',
    };
  }

  // Athlete portal area (/:slug/portal or /portal)
  if (pathname.includes('/portal')) {
    return {
      descriptionKey: 'accessDenied.portalArea',
      suggestionKey: 'accessDenied.portalSuggestion',
      showContactAdmin: false,
      showMembership: true,
      homeRoute: '/',
    };
  }

  // Tenant-specific routes
  const tenantMatch = pathname.match(/^\/([^/]+)/);
  if (tenantMatch && !['admin', 'login', 'portal', 'help'].includes(tenantMatch[1])) {
    return {
      descriptionKey: 'accessDenied.tenantArea',
      suggestionKey: 'accessDenied.tenantSuggestion',
      showContactAdmin: true,
      showMembership: false,
      homeRoute: `/${tenantMatch[1]}`,
    };
  }

  // Default fallback
  return {
    descriptionKey: 'accessDenied.default',
    suggestionKey: 'accessDenied.defaultSuggestion',
    showContactAdmin: true,
    showMembership: false,
    homeRoute: '/',
  };
}

export function AccessDenied({ titleKey, descriptionKey }: AccessDeniedProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const context = useAccessDeniedContext();

  // Use provided keys or context-aware defaults
  const title = t(titleKey || 'accessDenied.title');
  const description = t(descriptionKey || context.descriptionKey);
  const suggestion = t(context.suggestionKey);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="mt-2">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground text-center mb-2">
            {suggestion}
          </p>
          
          <Button 
            variant="outline" 
            onClick={() => navigate(-1)}
            className="w-full"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.goBack')}
          </Button>
          
          <Button asChild className="w-full">
            <Link to={context.homeRoute}>
              <Home className="h-4 w-4 mr-2" />
              {t('common.goHome')}
            </Link>
          </Button>

          {context.showContactAdmin && (
            <Button variant="ghost" asChild className="w-full">
              <Link to="/help">
                <Mail className="h-4 w-4 mr-2" />
                {t('accessDenied.contactAdmin')}
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AccessDenied;
