/**
 * 🚫 NotFound — Context-Aware 404 Page
 * PI-P7.1: Contextualized 404 with appropriate CTAs per route context
 */
import { useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, Building2, Shield } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { logger } from "@/lib/logger";

type NotFoundContext = 'admin' | 'tenant' | 'public';

function deriveContext(pathname: string): NotFoundContext {
  if (pathname.startsWith('/admin')) return 'admin';
  // Tenant routes: /:slug/app/...
  const tenantAppMatch = pathname.match(/^\/[^/]+\/app/);
  if (tenantAppMatch) return 'tenant';
  return 'public';
}

const NotFound = () => {
  const location = useLocation();
  const { t } = useI18n();
  
  const context = deriveContext(location.pathname);

  // Log 404 for monitoring (logger gates by env)
  logger.warn("404 - Route not found:", location.pathname, "context:", context);

  const config = {
    admin: {
      icon: Shield,
      titleKey: 'notFound.admin.title',
      descKey: 'notFound.admin.desc',
      ctaKey: 'notFound.admin.cta',
      ctaHref: '/admin',
    },
    tenant: {
      icon: Building2,
      titleKey: 'notFound.tenant.title',
      descKey: 'notFound.tenant.desc',
      ctaKey: 'notFound.tenant.cta',
      ctaHref: '/', // Will be dynamic based on tenant slug
    },
    public: {
      icon: Home,
      titleKey: 'notFound.public.title',
      descKey: 'notFound.public.desc',
      ctaKey: 'notFound.public.cta',
      ctaHref: '/',
    },
  }[context];

  // Extract tenant slug for tenant context
  const tenantSlugMatch = location.pathname.match(/^\/([^/]+)\/app/);
  const tenantSlug = tenantSlugMatch?.[1];
  const ctaHref = context === 'tenant' && tenantSlug 
    ? `/${tenantSlug}/app` 
    : config.ctaHref;

  const IconComponent = config.icon;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-md px-4">
        <div className="mx-auto h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-6">
          <IconComponent className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-6xl font-display font-bold text-primary">404</h1>
        <p className="text-xl text-muted-foreground">{t(config.titleKey)}</p>
        <p className="text-sm text-muted-foreground">
          {t(config.descKey)}
        </p>
        <Button asChild className="mt-4">
          <Link to={ctaHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t(config.ctaKey)}
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
