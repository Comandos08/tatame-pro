import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Building2, Users, Medal, Loader2, AlertCircle, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';

interface AcademyRanking {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  sport_type: string | null;
  athlete_count: number;
  diploma_count: number;
}

interface AthleteRanking {
  id: string;
  full_name: string;
  academy_name: string | null;
  current_academy_id: string | null;
  grading_count: number;
  last_grading_level: string | null;
}

/**
 * Internal Rankings Page
 * 
 * Ranking Logic:
 * - Academies: Ranked by number of ACTIVE memberships (athlete_count)
 * - Athletes: Ranked by total number of gradings recorded (grading_count)
 * 
 * Note: This is a simple count-based ranking. Future improvements could include:
 * - Weighted scoring based on grading level
 * - Time-based decay for older gradings
 * - Category-specific rankings (by sport, age group, etc.)
 */
export default function InternalRankings() {
  const { tenant } = useTenant();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [academyRankings, setAcademyRankings] = useState<AcademyRanking[]>([]);
  const [athleteRankings, setAthleteRankings] = useState<AthleteRanking[]>([]);
  const [sportFilter, setSportFilter] = useState<string>('all');
  const [academyFilter, setAcademyFilter] = useState<string>('all');
  const [minAthletes, setMinAthletes] = useState<string>('0');
  const [academies, setAcademies] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!tenant?.id) return;

    async function fetchRankings() {
      setLoading(true);
      setError(null);

      try {
        // Fetch academies for filter dropdown
        const { data: academiesData, error: academiesError } = await supabase
          .from('academies')
          .select('id, name')
          .eq('tenant_id', tenant.id)
          .eq('is_active', true)
          .order('name');

        if (academiesError) throw academiesError;
        if (academiesData) setAcademies(academiesData);

        // Fetch all active academies with their details
        const { data: academiesWithStats } = await supabase
          .from('academies')
          .select('id, name, city, state, sport_type')
          .eq('tenant_id', tenant.id)
          .eq('is_active', true);

        if (academiesWithStats && academiesWithStats.length > 0) {
          // Get all active memberships for counting
          const { data: memberships } = await supabase
            .from('memberships')
            .select('academy_id')
            .eq('tenant_id', tenant.id)
            .eq('status', 'ACTIVE')
            .not('academy_id', 'is', null);

          // Get all issued diplomas for counting
          const { data: diplomas } = await supabase
            .from('diplomas')
            .select('academy_id')
            .eq('tenant_id', tenant.id)
            .eq('status', 'ISSUED')
            .not('academy_id', 'is', null);

          // Count per academy
          const athleteCounts: Record<string, number> = {};
          const diplomaCounts: Record<string, number> = {};

          memberships?.forEach(m => {
            if (m.academy_id) {
              athleteCounts[m.academy_id] = (athleteCounts[m.academy_id] || 0) + 1;
            }
          });

          diplomas?.forEach(d => {
            if (d.academy_id) {
              diplomaCounts[d.academy_id] = (diplomaCounts[d.academy_id] || 0) + 1;
            }
          });

          // Merge counts with academies
          const rankingsWithCounts = academiesWithStats.map(academy => ({
            ...academy,
            athlete_count: athleteCounts[academy.id] || 0,
            diploma_count: diplomaCounts[academy.id] || 0,
          }));

          // Sort by athlete count descending
          rankingsWithCounts.sort((a, b) => b.athlete_count - a.athlete_count);
          setAcademyRankings(rankingsWithCounts);
        }

        // Fetch athletes
        const { data: athletes } = await supabase
          .from('athletes')
          .select('id, full_name, current_academy_id')
          .eq('tenant_id', tenant.id);

        if (athletes && athletes.length > 0) {
          const athleteIds = athletes.map(a => a.id);

          // Get all gradings in one query
          const { data: allGradings } = await supabase
            .from('athlete_gradings')
            .select(`
              athlete_id,
              promotion_date,
              grading_levels!inner(display_name, order_index)
            `)
            .eq('tenant_id', tenant.id)
            .in('athlete_id', athleteIds)
            .order('promotion_date', { ascending: false });

          // Get academies for athletes
          const academyIds = [...new Set(athletes.map(a => a.current_academy_id).filter(Boolean))] as string[];
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

          // Process gradings
          const gradingCountMap: Record<string, number> = {};
          const lastGradingMap: Record<string, string | null> = {};

          allGradings?.forEach(g => {
            gradingCountMap[g.athlete_id] = (gradingCountMap[g.athlete_id] || 0) + 1;
            if (!lastGradingMap[g.athlete_id]) {
              lastGradingMap[g.athlete_id] = (g.grading_levels as any)?.display_name || null;
            }
          });

          // Build athlete rankings
          const athleteRankingsData = athletes.map(athlete => ({
            id: athlete.id,
            full_name: athlete.full_name,
            academy_name: athlete.current_academy_id ? academyMap[athlete.current_academy_id] || null : null,
            grading_count: gradingCountMap[athlete.id] || 0,
            last_grading_level: lastGradingMap[athlete.id] || null,
            current_academy_id: athlete.current_academy_id,
          }));

          // Sort by grading count descending
          athleteRankingsData.sort((a, b) => b.grading_count - a.grading_count);
          setAthleteRankings(athleteRankingsData);
        }
      } catch (err) {
        console.error('Error fetching internal rankings:', err);
        setError(err instanceof Error ? err.message : 'Failed to load rankings');
      } finally {
        setLoading(false);
      }
    }

    fetchRankings();
  }, [tenant?.id]);

  // Memoized filtered results for better performance
  const filteredAcademies = useMemo(() => {
    return academyRankings.filter(a => {
      if (sportFilter !== 'all' && a.sport_type !== sportFilter) return false;
      if (parseInt(minAthletes) > 0 && a.athlete_count < parseInt(minAthletes)) return false;
      return true;
    });
  }, [academyRankings, sportFilter, minAthletes]);

  const filteredAthletes = useMemo(() => {
    return athleteRankings.filter(a => {
      if (academyFilter !== 'all' && a.current_academy_id !== academyFilter) return false;
      return true;
    });
  }, [athleteRankings, academyFilter]);

  const sportTypes = useMemo(() => {
    return [...new Set(academyRankings.map(a => a.sport_type).filter(Boolean))];
  }, [academyRankings]);

  // Medal icon helper
  const getMedalIcon = (position: number) => {
    if (position === 1) return <Medal className="h-5 w-5 text-yellow-500" />;
    if (position === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (position === 3) return <Medal className="h-5 w-5 text-amber-600" />;
    return null;
  };

  if (!tenant) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <motion.h1 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="font-display text-3xl font-bold mb-2 flex items-center gap-3"
          >
            <Trophy className="h-8 w-8 text-primary" />
            {t('rankings.internal')}
          </motion.h1>
          <p className="text-muted-foreground">{t('rankings.internalDesc')}</p>
        </div>

        {/* Info about ranking methodology */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {t('rankings.methodologyHint')}
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          </div>
        ) : (
          <Tabs defaultValue="academies" className="space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="academies" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {t('rankings.academies')} ({filteredAcademies.length})
              </TabsTrigger>
              <TabsTrigger value="athletes" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                {t('rankings.athletes')} ({filteredAthletes.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="academies" className="space-y-4">
              {/* Filters */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-sm font-medium mb-2 block">{t('rankings.filterBySport')}</label>
                      <Select value={sportFilter} onValueChange={setSportFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('tenant.allSports')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('tenant.allSports')}</SelectItem>
                          {sportTypes.map(sport => (
                            <SelectItem key={sport} value={sport!}>{sport}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-sm font-medium mb-2 block">{t('rankings.minAthletes')}</label>
                      <Select value={minAthletes} onValueChange={setMinAthletes}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0+</SelectItem>
                          <SelectItem value="10">10+</SelectItem>
                          <SelectItem value="25">25+</SelectItem>
                          <SelectItem value="50">50+</SelectItem>
                          <SelectItem value="100">100+</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Academy Rankings Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-warning" />
                    {t('rankings.topAcademies')}
                  </CardTitle>
                  <CardDescription>{t('rankings.byActiveAthletes')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {filteredAcademies.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground font-medium">{t('rankings.noData')}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {academyRankings.length > 0 
                          ? t('rankings.adjustFilters')
                          : t('rankings.noActiveAcademies')}
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">{t('rankings.position')}</TableHead>
                          <TableHead>{t('common.name')}</TableHead>
                          <TableHead>{t('rankings.city')}</TableHead>
                          <TableHead>{t('rankings.sport')}</TableHead>
                          <TableHead className="text-right">{t('rankings.athleteCount')}</TableHead>
                          <TableHead className="text-right">{t('rankings.diplomasIssued')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAcademies.map((academy, index) => (
                          <TableRow key={academy.id} className="hover:bg-muted/50">
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                {getMedalIcon(index + 1)}
                                <Badge variant={index < 3 ? 'default' : 'secondary'} className="w-8 justify-center">
                                  {index + 1}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">{academy.name}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {[academy.city, academy.state].filter(Boolean).join(', ') || '—'}
                            </TableCell>
                            <TableCell>
                              {academy.sport_type ? (
                                <Badge variant="outline">{academy.sport_type}</Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold">{academy.athlete_count}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{academy.diploma_count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="athletes" className="space-y-4">
              {/* Filters */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-sm font-medium mb-2 block">{t('rankings.filterByAcademy')}</label>
                      <Select value={academyFilter} onValueChange={setAcademyFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('rankings.allAcademies')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('rankings.allAcademies')}</SelectItem>
                          {academies.map(academy => (
                            <SelectItem key={academy.id} value={academy.id}>{academy.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Athlete Rankings Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Medal className="h-5 w-5 text-warning" />
                    {t('rankings.topAthletes')}
                  </CardTitle>
                  <CardDescription>{t('rankings.byGradings')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {filteredAthletes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {t('rankings.noData')}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">{t('rankings.position')}</TableHead>
                          <TableHead>{t('rankings.fullName')}</TableHead>
                          <TableHead>{t('rankings.currentAcademy')}</TableHead>
                          <TableHead>{t('rankings.lastGrading')}</TableHead>
                          <TableHead className="text-right">{t('rankings.gradingCount')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAthletes.map((athlete, index) => (
                          <TableRow key={athlete.id}>
                            <TableCell>
                              <Badge variant={index < 3 ? 'default' : 'secondary'} className="w-8 justify-center">
                                {index + 1}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">{athlete.full_name}</TableCell>
                            <TableCell>{athlete.academy_name || '-'}</TableCell>
                            <TableCell>
                              {athlete.last_grading_level ? (
                                <Badge variant="outline">{athlete.last_grading_level}</Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-right font-semibold">{athlete.grading_count}</TableCell>
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
      </div>
    </AppShell>
  );
}
