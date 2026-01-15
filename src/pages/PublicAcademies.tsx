import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, MapPin, ArrowLeft, Loader2, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';

interface Academy {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  sport_type: string | null;
}

export default function PublicAcademies() {
  const { tenant } = useTenant();
  const { t } = useI18n();
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAcademies() {
      if (!tenant?.id) return;

      const { data, error } = await supabase
        .from('academies')
        .select('id, name, city, state, sport_type')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('name');

      if (!error && data) {
        setAcademies(data);
      }
      setLoading(false);
    }

    fetchAcademies();
  }, [tenant?.id]);

  if (!tenant) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
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
          <Button variant="outline" asChild>
            <Link to={`/${tenant.slug}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto py-12 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <div className="text-center mb-12">
            <div 
              className="inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-4"
              style={{ backgroundColor: `${tenant.primaryColor}20` }}
            >
              <Building2 className="h-8 w-8" style={{ color: tenant.primaryColor }} />
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold mb-4">
              {t('tenant.accreditedAcademies')}
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Academias oficialmente credenciadas pela {tenant.name}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : academies.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Nenhuma academia credenciada no momento.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {academies.map((academy, index) => (
                <motion.div
                  key={academy.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="h-full hover:border-primary/50 transition-colors">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg">{academy.name}</CardTitle>
                        {academy.sport_type && (
                          <Badge variant="secondary" className="shrink-0">
                            {academy.sport_type}
                          </Badge>
                        )}
                      </div>
                      {(academy.city || academy.state) && (
                        <CardDescription className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {[academy.city, academy.state].filter(Boolean).join(', ')}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        Academia credenciada por {tenant.name}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}

          <div className="mt-12 text-center">
            <p className="text-muted-foreground mb-4">
              Quer credenciar sua academia?
            </p>
            <Button style={{ backgroundColor: tenant.primaryColor }} asChild>
              <Link to={`/${tenant.slug}/membership/new`}>
                {t('tenant.joinNow')}
              </Link>
            </Button>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-border mt-auto">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {tenant.name}. Powered by{' '}
            <Link to="/" className="text-primary hover:underline">IPPON</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
