import React, { useState } from 'react';
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
  Filter
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { AppShell } from '@/layouts/AppShell';
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
}

interface Academy {
  id: string;
  name: string;
}

export default function AthletesList() {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [searchName, setSearchName] = useState('');
  const [filterAcademy, setFilterAcademy] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

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

  // Fetch athletes with their latest membership
  const { data: athletes, isLoading } = useQuery({
    queryKey: ['athletes-list', tenant?.id, searchName, filterAcademy, filterStatus],
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

      // Get memberships for these athletes
      const athleteIds = athletesData.map(a => a.id);
      const { data: membershipsData, error: membershipsError } = await supabase
        .from('memberships')
        .select('id, athlete_id, status, start_date, end_date')
        .eq('tenant_id', tenant!.id)
        .in('athlete_id', athleteIds)
        .order('created_at', { ascending: false });

      if (membershipsError) throw membershipsError;

      // Map memberships to athletes (get latest per athlete)
      const membershipsByAthlete = new Map<string, typeof membershipsData[0]>();
      membershipsData.forEach(m => {
        if (!membershipsByAthlete.has(m.athlete_id)) {
          membershipsByAthlete.set(m.athlete_id, m);
        }
      });

      // Combine data
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
      }));

      // Filter by membership status if specified
      if (filterStatus && filterStatus !== 'all') {
        result = result.filter(a => a.latest_membership?.status === filterStatus);
      }

      return result;
    },
    enabled: !!tenant?.id,
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Atletas
          </h1>
          <p className="text-muted-foreground">
            Gerencie os atletas cadastrados na organização
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterAcademy} onValueChange={setFilterAcademy}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <Building2 className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Academia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas academias</SelectItem>
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
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="ACTIVE">Ativa</SelectItem>
                  <SelectItem value="PENDING_REVIEW">Aguardando Aprovação</SelectItem>
                  <SelectItem value="PENDING_PAYMENT">Aguardando Pagamento</SelectItem>
                  <SelectItem value="EXPIRED">Expirada</SelectItem>
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
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                Nenhum atleta encontrado com os filtros selecionados.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Atleta</TableHead>
                    <TableHead>Academia</TableHead>
                    <TableHead>Status Filiação</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
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
                        {athlete.latest_membership ? (
                          <StatusBadge 
                            status={athlete.latest_membership.status} 
                            label={MEMBERSHIP_STATUS_LABELS[athlete.latest_membership.status]}
                          />
                        ) : (
                          <Badge variant="outline">Sem filiação</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {athlete.latest_membership ? (
                          <span className="text-sm text-muted-foreground">
                            {formatDate(athlete.latest_membership.start_date)} - {formatDate(athlete.latest_membership.end_date)}
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
                            Graduações
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
