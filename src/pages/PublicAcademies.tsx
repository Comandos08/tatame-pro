import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, MapPin, Loader2, Search, Filter } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTenant } from '@/contexts/TenantContext';
import { LoadingState } from '@/components/ux/LoadingState';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import PublicHeader from '@/components/PublicHeader';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [sportFilter, setSportFilter] = useState<string>('all');

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

  // Get unique sports for filter
  const uniqueSports = useMemo(() => {
    const sports = new Set(academies.map(a => a.sport_type).filter(Boolean));
    return Array.from(sports) as string[];
  }, [academies]);

  // Filter academies
  const filteredAcademies = useMemo(() => {
    return academies.filter(academy => {
      const matchesSearch = !searchQuery || 
        academy.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (academy.city && academy.city.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesSport = sportFilter === 'all' || academy.sport_type === sportFilter;
      
      return matchesSearch && matchesSport;
    });
  }, [academies, searchQuery, sportFilter]);

  if (!tenant) return <LoadingState titleKey="common.loading" />;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <PublicHeader tenant={tenant} showBackButton backTo={`/${tenant.slug}`} />

      {/* Content */}
      <main className="container mx-auto py-12 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-5xl mx-auto"
        >
          <div className="text-center mb-8">
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

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('tenant.searchAcademies')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={sportFilter} onValueChange={setSportFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder={t('tenant.filterBySport')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('tenant.allSports')}</SelectItem>
                {uniqueSports.map(sport => (
                  <SelectItem key={sport} value={sport}>{sport}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredAcademies.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {academies.length === 0 
                    ? t('empty.publicAcademies.title')
                    : t('common.noResults')
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {t('empty.publicAcademies.count', { count: String(filteredAcademies.length) })}
              </p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAcademies.map((academy, index) => (
                  <motion.div
                    key={academy.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <Card className="h-full hover:border-primary/50 transition-colors">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div 
                              className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${tenant.primaryColor}15` }}
                            >
                              <Building2 className="h-5 w-5" style={{ color: tenant.primaryColor }} />
                            </div>
                            <CardTitle className="text-base">{academy.name}</CardTitle>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          {(academy.city || academy.state) && (
                            <CardDescription className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {[academy.city, academy.state].filter(Boolean).join(', ')}
                            </CardDescription>
                          )}
                          {academy.sport_type && (
                            <Badge variant="secondary" className="text-xs">
                              {academy.sport_type}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </>
          )}

          <div className="mt-12 text-center">
            <p className="text-muted-foreground mb-4">
              {t('tenant.wantToJoin')}
            </p>
            <Button variant="tenant" asChild>
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
            <Link to="/" className="text-primary hover:underline">TATAME</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
