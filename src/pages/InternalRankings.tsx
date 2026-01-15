import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Building2, Users, Medal, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
  grading_count: number;
  last_grading_level: string | null;
}

export default function InternalRankings() {
  const { tenant } = useTenant();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
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

      // Fetch academies for filter
      const { data: academiesData } = await supabase
        .from('academies')
        .select('id, name')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('name');

      if (academiesData) setAcademies(academiesData);

      // Fetch academy rankings with athlete counts
      const { data: academiesWithStats } = await supabase
        .from('academies')
        .select(`
          id,
          name,
          city,
          state,
          sport_type
        `)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);

      if (academiesWithStats) {
        // For each academy, count athletes and diplomas
        const rankingsWithCounts = await Promise.all(
          academiesWithStats.map(async (academy) => {
            const { count: athleteCount } = await supabase
              .from('memberships')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenant.id)
              .eq('academy_id', academy.id)
              .eq('status', 'ACTIVE');

            const { count: diplomaCount } = await supabase
              .from('diplomas')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenant.id)
              .eq('academy_id', academy.id)
              .eq('status', 'ISSUED');

            return {
              ...academy,
              athlete_count: athleteCount || 0,
              diploma_count: diplomaCount || 0,
            };
          })
        );

        // Sort by athlete count descending
        rankingsWithCounts.sort((a, b) => b.athlete_count - a.athlete_count);
        setAcademyRankings(rankingsWithCounts);
      }

      // Fetch athlete rankings with grading counts
      const { data: athletes } = await supabase
        .from('athletes')
        .select(`
          id,
          full_name,
          current_academy_id
        `)
        .eq('tenant_id', tenant.id);

      if (athletes) {
        const athleteRankingsData = await Promise.all(
          athletes.map(async (athlete) => {
            const { count: gradingCount } = await supabase
              .from('athlete_gradings')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenant.id)
              .eq('athlete_id', athlete.id);

            // Get last grading level
            const { data: lastGrading } = await supabase
              .from('athlete_gradings')
              .select(`
                grading_level_id,
                grading_levels (
                  display_name,
                  order_index
                )
              `)
              .eq('tenant_id', tenant.id)
              .eq('athlete_id', athlete.id)
              .order('promotion_date', { ascending: false })
              .limit(1)
              .single();

            // Get academy name
            let academyName: string | null = null;
            if (athlete.current_academy_id) {
              const { data: academy } = await supabase
                .from('academies')
                .select('name')
                .eq('id', athlete.current_academy_id)
                .single();
              academyName = academy?.name || null;
            }

            return {
              id: athlete.id,
              full_name: athlete.full_name,
              academy_name: academyName,
              grading_count: gradingCount || 0,
              last_grading_level: (lastGrading?.grading_levels as any)?.display_name || null,
              current_academy_id: athlete.current_academy_id,
            };
          })
        );

        // Sort by grading count descending
        athleteRankingsData.sort((a, b) => b.grading_count - a.grading_count);
        setAthleteRankings(athleteRankingsData);
      }

      setLoading(false);
    }

    fetchRankings();
  }, [tenant?.id]);

  if (!tenant) return null;

  // Apply filters
  const filteredAcademies = academyRankings.filter(a => {
    if (sportFilter !== 'all' && a.sport_type !== sportFilter) return false;
    if (parseInt(minAthletes) > 0 && a.athlete_count < parseInt(minAthletes)) return false;
    return true;
  });

  const filteredAthletes = athleteRankings.filter(a => {
    if (academyFilter !== 'all' && (a as any).current_academy_id !== academyFilter) return false;
    return true;
  });

  const sportTypes = [...new Set(academyRankings.map(a => a.sport_type).filter(Boolean))];

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

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="academies" className="space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="academies" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {t('rankings.academies')}
              </TabsTrigger>
              <TabsTrigger value="athletes" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                {t('rankings.athletes')}
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
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    {t('rankings.topAcademies')}
                  </CardTitle>
                  <CardDescription>{t('rankings.byActiveAthletes')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {filteredAcademies.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {t('rankings.noData')}
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
                          <TableRow key={academy.id}>
                            <TableCell>
                              <Badge variant={index < 3 ? 'default' : 'secondary'} className="w-8 justify-center">
                                {index + 1}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">{academy.name}</TableCell>
                            <TableCell>{academy.city}, {academy.state}</TableCell>
                            <TableCell>
                              {academy.sport_type && (
                                <Badge variant="outline">{academy.sport_type}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold">{academy.athlete_count}</TableCell>
                            <TableCell className="text-right">{academy.diploma_count}</TableCell>
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
                    <Medal className="h-5 w-5 text-yellow-500" />
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
