import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  Search, 
  Users, 
  Loader2, 
  ChevronRight,
  Building2,
  Award,
  Filter,
  ArrowUpDown
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { formatDate } from '@/lib/i18n/formatters';
import { AppShell } from '@/layouts/AppShell';
import { EmptyStateCard } from '@/components/ux/EmptyStateCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ExportCsvButton } from '@/components/export/ExportCsvButton';
import { formatDateForCsv } from '@/lib/exportCsv';
import { MEMBERSHIP_STATUS_LABELS, type MembershipStatus } from '@/types/membership';

interface AthleteWithMembership {
  id: string;
  full_name: string;
  email: string;
  birth_date: string;
  current_academy_id: string | null;
  current_main_coach_id: string | null;
  academy_name: string | null;
  latest_membership: {
    id: string;
    status: MembershipStatus;
    start_date: string | null;
    end_date: string | null;
  } | null;
  currentGrading: {
    level_id: string;
    display_name: string;
    order_index: number;
  } | null;
}

interface Academy {
  id: string;
  name: string;
}

interface GradingLevel {
  id: string;
  display_name: string;
  order_index: number;
}

interface AthleteCurrentGrading {
  athlete_id: string;
  grading_level_id: string;
  level_name: string;
  order_index: number;
}

export default function AthletesList() {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const [searchName, setSearchName] = useState('');
  const [filterAcademy, setFilterAcademy] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterGrading, setFilterGrading] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'grading'>('name');

  // Fetch academies for filter
  const { data: academies } = useQuery({
    queryKey: ['academies', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academies')
        .select('id, name')
        .eq('tenant_id', tenant!.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Academy[];
    },
    enabled: !!tenant?.id,
  });

  // Fetch grading levels for filter dropdown
  const { data: gradingLevels } = useQuery({
    queryKey: ['grading-levels-filter', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grading_levels')
        .select('id, display_name, order_index')
        .eq('tenant_id', tenant!.id)
        .eq('is_active', true)
        .order('order_index');
      if (error) throw error;
      return data as GradingLevel[];
    },
    enabled: !!tenant?.id,
  });

  // Fetch athletes with their latest membership and current grading
  const { data: athletes, isLoading } = useQuery({
    queryKey: ['athletes-list', tenant?.id, searchName, filterAcademy, filterStatus, filterGrading, sortBy],
    queryFn: async () => {
      // First get athletes
      let athleteQuery = supabase
        .from('athletes')
        .select(`
          id, full_name, email, birth_date,
          current_academy_id, current_main_coach_id,
          academies:current_academy_id (id, name)
        `)
        .eq('tenant_id', tenant!.id)
        .order('full_name');

      if (searchName) {
        athleteQuery = athleteQuery.ilike('full_name', `%${searchName}%`);
      }

      if (filterAcademy && filterAcademy !== 'all') {
        athleteQuery = athleteQuery.eq('current_academy_id', filterAcademy);
      }

      const { data: athletesData, error: athletesError } = await athleteQuery;
      if (athletesError) throw athletesError;

      if (!athletesData.length) return [];

      // Get memberships for these athletes
      const athleteIds = athletesData.map(a => a.id);
      const { data: membershipsData, error: membershipsError } = await supabase
        .from('memberships')
        .select('id, athlete_id, status, start_date, end_date')
        .eq('tenant_id', tenant!.id)
        .in('athlete_id', athleteIds)
        .order('created_at', { ascending: false });

      if (membershipsError) throw membershipsError;

      // Get current gradings for these athletes
      const { data: gradingsData } = await supabase
        .from('athlete_current_grading')
        .select('athlete_id, grading_level_id, level_name, order_index')
        .in('athlete_id', athleteIds);

      // Map memberships to athletes (get latest per athlete)
      const membershipsByAthlete = new Map<string, typeof membershipsData[0]>();
      membershipsData.forEach(m => {
        if (m.athlete_id && !membershipsByAthlete.has(m.athlete_id)) {
          membershipsByAthlete.set(m.athlete_id, m);
        }
      });

      // Create grading map
      const gradingsByAthlete = new Map<string, AthleteCurrentGrading>();
      (gradingsData as AthleteCurrentGrading[] | null)?.forEach(g => {
        gradingsByAthlete.set(g.athlete_id, g);
      });

      // Combine data including grading
      let result: AthleteWithMembership[] = athletesData.map(athlete => ({
        id: athlete.id,
        full_name: athlete.full_name,
        email: athlete.email,
        birth_date: athlete.birth_date,
        current_academy_id: athlete.current_academy_id,
        current_main_coach_id: athlete.current_main_coach_id,
        academy_name: (athlete.academies as any)?.name || null,
        latest_membership: membershipsByAthlete.has(athlete.id)
          ? {
              id: membershipsByAthlete.get(athlete.id)!.id,
              status: membershipsByAthlete.get(athlete.id)!.status as MembershipStatus,
              start_date: membershipsByAthlete.get(athlete.id)!.start_date,
              end_date: membershipsByAthlete.get(athlete.id)!.end_date,
            }
          : null,
        currentGrading: gradingsByAthlete.has(athlete.id)
          ? {
              level_id: gradingsByAthlete.get(athlete.id)!.grading_level_id,
              display_name: gradingsByAthlete.get(athlete.id)!.level_name,
              order_index: gradingsByAthlete.get(athlete.id)!.order_index,
            }
          : null,
      }));

      // Filter by membership status if specified
      if (filterStatus && filterStatus !== 'all') {
        result = result.filter(a => a.latest_membership?.status === filterStatus);
      }

      // Filter by grading if specified
      if (filterGrading && filterGrading !== 'all') {
        result = result.filter(a => a.currentGrading?.level_id === filterGrading);
      }

      // Sort
      result.sort((a, b) => {
        if (sortBy === 'grading') {
          const orderA = a.currentGrading?.order_index ?? 999;
          const orderB = b.currentGrading?.order_index ?? 999;
          return orderA - orderB;
        }
        return a.full_name.localeCompare(b.full_name);
      });

      return result;
    },
    enabled: !!tenant?.id,
  });

  const formatDisplayDate = (dateStr: string | null) => {
    return formatDate(dateStr, locale, { dateStyle: 'short' });
  };

  // CSV Export columns
  const csvColumns = useMemo(() => [
    { key: 'full_name', label: t('admin.athletes.csv.name') },
    { key: 'email', label: t('admin.athletes.csv.email') },
    { key: 'birth_date', label: t('admin.athletes.csv.birthDate'), format: (v: string | null) => formatDateForCsv(v ?? '') },
    { key: 'academy_name', label: t('admin.athletes.csv.academy'), format: (v: string | null) => v || '-' },
    { 
      key: 'membershipStatus', 
      label: t('admin.athletes.csv.membershipStatus'), 
      format: (_: unknown, row: AthleteWithMembership) => 
        row.latest_membership?.status ? MEMBERSHIP_STATUS_LABELS[row.latest_membership.status] : t('admin.athletes.noMembership')
    },
    { 
      key: 'membershipStart', 
      label: t('admin.athletes.csv.membershipStart'), 
      format: (_: unknown, row: AthleteWithMembership) => 
        row.latest_membership?.start_date ? formatDateForCsv(row.latest_membership.start_date) : '-'
    },
    { 
      key: 'membershipEnd', 
      label: t('admin.athletes.csv.membershipEnd'), 
      format: (_: unknown, row: AthleteWithMembership) => 
        row.latest_membership?.end_date ? formatDateForCsv(row.latest_membership.end_date) : '-'
    },
  ], [t]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              {t('admin.athletes.title')}
            </h1>
            <p className="text-muted-foreground">
              {t('admin.athletes.description')}
            </p>
          </div>
          <ExportCsvButton
            filename={`atletas_${tenant?.slug || 'export'}`}
            columns={csvColumns}
            data={athletes || []}
            isLoading={isLoading}
          />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('admin.athletes.searchPlaceholder')}
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterAcademy} onValueChange={setFilterAcademy}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <Building2 className="h-4 w-4 mr-2" />
                  <SelectValue placeholder={t('admin.athletes.filterAcademy')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('admin.athletes.allAcademies')}</SelectItem>
                  {academies?.map((academy) => (
                    <SelectItem key={academy.id} value={academy.id}>
                      {academy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder={t('admin.athletes.filterStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('admin.athletes.allStatus')}</SelectItem>
                  <SelectItem value="ACTIVE">{t('status.active')}</SelectItem>
                  <SelectItem value="PENDING_REVIEW">{t('status.pending_review')}</SelectItem>
                  <SelectItem value="PENDING_PAYMENT">{t('status.pending_payment')}</SelectItem>
                  <SelectItem value="EXPIRED">{t('status.expired')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterGrading} onValueChange={setFilterGrading}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <Award className="h-4 w-4 mr-2" />
                  <SelectValue placeholder={t('admin.athletes.filterGrading')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('admin.athletes.allGradings')}</SelectItem>
                  {gradingLevels?.map((level) => (
                    <SelectItem key={level.id} value={level.id}>
                      {level.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'name' | 'grading')}>
                <SelectTrigger className="w-full md:w-[150px]">
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  <SelectValue placeholder={t('admin.athletes.sortBy')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">{t('admin.athletes.sortByName')}</SelectItem>
                  <SelectItem value="grading">{t('admin.athletes.sortByGrading')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Athletes table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !athletes?.length ? (
          <Card>
            <CardContent className="p-0">
              <EmptyStateCard
                icon={Users}
                titleKey="empty.athletes.admin.title"
                descriptionKey="empty.athletes.admin.desc"
                hintKey="empty.athletes.admin.hint"
                variant="inline"
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.athletes.tableAthlete')}</TableHead>
                    <TableHead>{t('admin.athletes.tableAcademy')}</TableHead>
                    <TableHead>{t('admin.athletes.tableGrading')}</TableHead>
                    <TableHead>{t('admin.athletes.tableMembershipStatus')}</TableHead>
                    <TableHead>{t('admin.athletes.tablePeriod')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {athletes.map((athlete, index) => (
                    <motion.tr
                      key={athlete.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.02 }}
                      className="group"
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{athlete.full_name}</p>
                          <p className="text-sm text-muted-foreground">{athlete.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {athlete.academy_name ? (
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span>{athlete.academy_name}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {athlete.currentGrading ? (
                          <Badge variant="secondary">{athlete.currentGrading.display_name}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {athlete.latest_membership ? (
                          <StatusBadge 
                            status={athlete.latest_membership.status} 
                            label={MEMBERSHIP_STATUS_LABELS[athlete.latest_membership.status]}
                          />
                        ) : (
                          <Badge variant="outline">{t('admin.athletes.noMembership')}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {athlete.latest_membership ? (
                          <span className="text-sm text-muted-foreground">
                            {formatDisplayDate(athlete.latest_membership.start_date)} - {formatDisplayDate(athlete.latest_membership.end_date)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/${tenant?.slug}/app/athletes/${athlete.id}/gradings`)}
                          >
                            <Award className="h-4 w-4 mr-1" />
                            {t('admin.athletes.gradings')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (athlete.latest_membership) {
                                navigate(`/${tenant?.slug}/app/memberships/${athlete.latest_membership.id}`);
                              }
                            }}
                            disabled={!athlete.latest_membership}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
