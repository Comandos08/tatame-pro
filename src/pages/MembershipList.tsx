import React from 'react';
import { motion } from 'framer-motion';
import { FileText, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import {
  MembershipStatus,
  PaymentStatus,
  MEMBERSHIP_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '@/types/membership';
import { useNavigate, useParams } from 'react-router-dom';

interface MembershipWithAthlete {
  id: string;
  status: MembershipStatus;
  start_date: string | null;
  end_date: string | null;
  payment_status: PaymentStatus;
  price_cents: number;
  currency: string;
  created_at: string;
  athlete: {
    full_name: string;
    email: string;
  };
}

export default function MembershipList() {
  const { tenant } = useTenant();
  const { currentUser } = useCurrentUser();
  const navigate = useNavigate();
  const { tenantSlug } = useParams();

  const { data: memberships, isLoading, error } = useQuery({
    queryKey: ['memberships', tenant?.id, currentUser?.id],
    queryFn: async () => {
      if (!tenant || !currentUser) return [];

      // Get athlete record for current user
      const { data: athlete } = await supabase
        .from('athletes')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('profile_id', currentUser.id)
        .maybeSingle();

      if (!athlete) {
        // Check if user is a guardian
        const { data: guardian } = await supabase
          .from('guardians')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('profile_id', currentUser.id)
          .maybeSingle();

        if (!guardian) return [];

        // Get linked athletes
        const { data: links } = await supabase
          .from('guardian_links')
          .select('athlete_id')
          .eq('guardian_id', guardian.id);

        if (!links?.length) return [];

        const athleteIds = links.map(l => l.athlete_id);

        const { data, error } = await supabase
          .from('memberships')
          .select(`
            id,
            status,
            start_date,
            end_date,
            payment_status,
            price_cents,
            currency,
            created_at,
            athlete:athletes(full_name, email)
          `)
          .eq('tenant_id', tenant.id)
          .in('athlete_id', athleteIds)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data as unknown as MembershipWithAthlete[];
      }

      const { data, error: membershipError } = await supabase
        .from('memberships')
        .select(`
          id,
          status,
          start_date,
          end_date,
          payment_status,
          price_cents,
          currency,
          created_at,
          athlete:athletes(full_name, email)
        `)
        .eq('tenant_id', tenant.id)
        .eq('athlete_id', athlete.id)
        .order('created_at', { ascending: false });

      if (membershipError) throw membershipError;
      return data as unknown as MembershipWithAthlete[];
    },
    enabled: !!tenant && !!currentUser,
  });

  const getStatusBadgeVariant = (status: MembershipStatus) => {
    switch (status) {
      case 'ACTIVE':
        return 'default';
      case 'PENDING_REVIEW':
      case 'PENDING_PAYMENT':
        return 'secondary';
      case 'APPROVED':
        return 'outline';
      case 'EXPIRED':
      case 'CANCELLED':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getPaymentBadgeVariant = (status: PaymentStatus) => {
    switch (status) {
      case 'PAID':
        return 'default';
      case 'NOT_PAID':
        return 'secondary';
      case 'FAILED':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  if (!tenant) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold">
              Minhas Filiações
            </h1>
            <p className="text-muted-foreground">
              Acompanhe o status das suas filiações
            </p>
          </div>
          <Button onClick={() => navigate(`/${tenantSlug}/membership/new`)}>
            Nova Filiação
          </Button>
        </motion.div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Filiações
            </CardTitle>
            <CardDescription>
              Lista de todas as suas filiações na {tenant.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                <p className="text-muted-foreground">Erro ao carregar filiações</p>
              </div>
            ) : memberships && memberships.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Atleta</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Validade</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {memberships.map((membership) => (
                      <TableRow key={membership.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{membership.athlete?.full_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {membership.athlete?.email}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(membership.status)}>
                            {MEMBERSHIP_STATUS_LABELS[membership.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getPaymentBadgeVariant(membership.payment_status)}>
                            {PAYMENT_STATUS_LABELS[membership.payment_status]}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(membership.start_date)}</TableCell>
                        <TableCell>{formatDate(membership.end_date)}</TableCell>
                        <TableCell className="text-right">
                          {membership.status === 'ACTIVE' && (
                            <Button size="sm" variant="ghost">
                              <ExternalLink className="h-4 w-4 mr-1" />
                              Carteira
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium text-lg mb-1">Nenhuma filiação encontrada</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Você ainda não possui filiações registradas
                </p>
                <Button onClick={() => navigate(`/${tenantSlug}/membership/new`)}>
                  Fazer minha filiação
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
