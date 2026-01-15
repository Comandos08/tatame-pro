import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, Building2, Users, Loader2, Medal, Award } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import PublicHeader from '@/components/PublicHeader';

interface AcademyRanking {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  athlete_count: number;
}

interface AthleteRanking {
  id: string;
  full_name: string;
  academy_name: string | null;
  grading_count: number;
  last_grading_level: string | null;
}

export default function PublicRankings() {
  const { tenant } = useTenant();
  const { t } = useI18n();
  const [academyRankings, setAcademyRankings] = useState<AcademyRanking[]>([]);
  const [athleteRankings, setAthleteRankings] = useState<AthleteRanking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRankings() {
      if (!tenant?.id) return;

      setLoading(true);

      try {
        // Fetch academies with active membership counts in a single query
        // First get all active academies
        const { data: academiesData } = await supabase
          .from('academies')
          .select('id, name, city, state')
          .eq('tenant_id', tenant.id)
          .eq('is_active', true);

        if (academiesData && academiesData.length > 0) {
          // Get all active memberships for this tenant with academy_id
          const { data: memberships } = await supabase
            .from('memberships')
            .select('academy_id')
            .eq('tenant_id', tenant.id)
            .eq('status', 'ACTIVE')
            .not('academy_id', 'is', null);

          // Count memberships per academy
          const academyCounts: Record<string, number> = {};
          memberships?.forEach(m => {
            if (m.academy_id) {
              academyCounts[m.academy_id] = (academyCounts[m.academy_id] || 0) + 1;
            }
          });

          // Merge counts with academies
          const academyWithCounts = academiesData.map(academy => ({
            ...academy,
            athlete_count: academyCounts[academy.id] || 0,
          }));

          // Sort by athlete count and take top 10 with at least 1 athlete
          const sorted = academyWithCounts
            .filter(a => a.athlete_count > 0)
            .sort((a, b) => b.athlete_count - a.athlete_count)
            .slice(0, 10);
          
          setAcademyRankings(sorted);
        }

        // Fetch athletes with grading counts - optimized query
        const { data: athletesData } = await supabase
          .from('athletes')
          .select('id, full_name, current_academy_id')
          .eq('tenant_id', tenant.id);

        if (athletesData && athletesData.length > 0) {
          // Get all gradings for these athletes in one query
          const athleteIds = athletesData.map(a => a.id);
          const { data: allGradings } = await supabase
            .from('athlete_gradings')
            .select(`
              athlete_id,
              promotion_date,
              grading_levels!inner(display_name)
            `)
            .in('athlete_id', athleteIds)
            .order('promotion_date', { ascending: false });

          // Get all academies for athletes that have one
          const academyIds = [...new Set(athletesData.map(a => a.current_academy_id).filter(Boolean))] as string[];
          const { data: academiesForAthletes } = academyIds.length > 0 
            ? await supabase
                .from('academies')
                .select('id, name')
                .in('id', academyIds)
            : { data: [] };

          const academyMap: Record<string, string> = {};
          academiesForAthletes?.forEach(a => {
            academyMap[a.id] = a.name;
          });

          // Process gradings - count per athlete and get last grading
          const gradingCountMap: Record<string, number> = {};
          const lastGradingMap: Record<string, string | null> = {};
          
          allGradings?.forEach(g => {
            gradingCountMap[g.athlete_id] = (gradingCountMap[g.athlete_id] || 0) + 1;
            // First occurrence is the most recent due to ordering
            if (!lastGradingMap[g.athlete_id]) {
              lastGradingMap[g.athlete_id] = (g.grading_levels as any)?.display_name || null;
            }
          });

          // Build athlete rankings
          const athleteWithGradings = athletesData.map(athlete => ({
            id: athlete.id,
            full_name: athlete.full_name,
            academy_name: athlete.current_academy_id ? academyMap[athlete.current_academy_id] || null : null,
            grading_count: gradingCountMap[athlete.id] || 0,
            last_grading_level: lastGradingMap[athlete.id] || null,
          }));

          // Sort by grading count and take top 10 with at least 1 grading
          const sorted = athleteWithGradings
            .filter(a => a.grading_count > 0)
            .sort((a, b) => b.grading_count - a.grading_count)
            .slice(0, 10);
          
          setAthleteRankings(sorted);
        }
      } catch (error) {
        console.error('Error fetching rankings:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchRankings();
  }, [tenant?.id]);

  if (!tenant) return null;

  const getMedalIcon = (position: number) => {
    if (position === 1) return <Medal className="h-5 w-5 text-yellow-500" />;
    if (position === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (position === 3) return <Medal className="h-5 w-5 text-amber-600" />;
    return <span className="font-mono text-muted-foreground">{position}</span>;
  };

  // Mask name for privacy (e.g., "João Silva" -> "João S.")
  const maskName = (name: string) => {
    const parts = name.split(' ');
    if (parts.length <= 1) return name;
    return `${parts[0]} ${parts.slice(1).map(p => p[0] + '.').join(' ')}`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <PublicHeader tenant={tenant} showBackButton backTo={`/${tenant.slug}`} />

      {/* Content */}
      <main className="container mx-auto py-12 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <div className="text-center mb-8">
            <div 
              className="inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-4"
              style={{ backgroundColor: `${tenant.primaryColor}20` }}
            >
              <Trophy className="h-8 w-8" style={{ color: tenant.primaryColor }} />
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold mb-4">
              {t('rankings.title')}
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {t('rankings.publicNote')}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="academies" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-8">
                <TabsTrigger value="academies" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {t('rankings.academies')}
                </TabsTrigger>
                <TabsTrigger value="athletes" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {t('rankings.athletes')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="academies">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="h-5 w-5" style={{ color: tenant.primaryColor }} />
                      {t('rankings.topAcademies')}
                    </CardTitle>
                    <CardDescription>{t('rankings.byActiveAthletes')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {academyRankings.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        {t('rankings.noData')}
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">{t('rankings.position')}</TableHead>
                            <TableHead>{t('rankings.academy')}</TableHead>
                            <TableHead className="text-right">{t('rankings.athleteCount')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {academyRankings.map((academy, index) => (
                            <TableRow key={academy.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center justify-center w-8 h-8">
                                  {getMedalIcon(index + 1)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{academy.name}</p>
                                  {(academy.city || academy.state) && (
                                    <p className="text-sm text-muted-foreground">
                                      {[academy.city, academy.state].filter(Boolean).join(', ')}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary">
                                  {academy.athlete_count >= 50 ? '50+' : 
                                   academy.athlete_count >= 10 ? '10+' : 
                                   academy.athlete_count.toString()}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="athletes">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5" style={{ color: tenant.primaryColor }} />
                      {t('rankings.topAthletes')}
                    </CardTitle>
                    <CardDescription>{t('rankings.byGradings')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {athleteRankings.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        {t('rankings.noData')}
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">{t('rankings.position')}</TableHead>
                            <TableHead>{t('common.name')}</TableHead>
                            <TableHead>{t('rankings.lastGrading')}</TableHead>
                            <TableHead className="text-right">{t('rankings.gradingCount')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {athleteRankings.map((athlete, index) => (
                            <TableRow key={athlete.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center justify-center w-8 h-8">
                                  {getMedalIcon(index + 1)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{maskName(athlete.full_name)}</p>
                                  {athlete.academy_name && (
                                    <p className="text-sm text-muted-foreground">{athlete.academy_name}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {athlete.last_grading_level ? (
                                  <Badge variant="outline">{athlete.last_grading_level}</Badge>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary">{athlete.grading_count}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          <div className="mt-8 text-center">
            <Button style={{ backgroundColor: tenant.primaryColor }} asChild>
              <Link to={`/${tenant.slug}/app`}>
                {t('nav.accessPortal')}
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
