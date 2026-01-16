import React from 'react';
import { motion } from 'framer-motion';
import { ClipboardCheck, Clock, AlertCircle, Loader2, ChevronRight, User, CreditCard, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { supabase } from '@/integrations/supabase/client';
import {
  MembershipStatus,
  PaymentStatus,
  MEMBERSHIP_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '@/types/membership';

interface MembershipForApproval {
  id: string;
  status: MembershipStatus;
  payment_status: PaymentStatus;
  created_at: string;
  athlete: {
    id: string;
    full_name: string;
    email: string;
  };
  academy: {
    id: string;
    name: string;
  } | null;
}

export default function ApprovalsList() {
  const { tenant } = useTenant();
  const { currentUser, hasRole, isGlobalSuperadmin } = useCurrentUser();
  const navigate = useNavigate();
  const { tenantSlug } = useParams();

  // Check if user has approval permissions
  const canApprove = isGlobalSuperadmin || 
    (tenant && (
      hasRole('ADMIN_TENANT', tenant.id) || 
      hasRole('STAFF_ORGANIZACAO', tenant.id) ||
      hasRole('COACH_PRINCIPAL', tenant.id)
    ));

  const { data: memberships, isLoading, error } = useQuery({
    queryKey: ['pending-approvals', tenant?.id, currentUser?.id],
    queryFn: async () => {
      if (!tenant || !currentUser) return [];

      // First, get memberships pending review
      let query = supabase
        .from('memberships')
        .select(`
          id,
          status,
          payment_status,
          created_at,
          academy_id,
          athlete:athletes(id, full_name, email),
          academy:academies(id, name)
        `)
        .eq('tenant_id', tenant.id)
        .eq('status', 'PENDING_REVIEW')
        .order('created_at', { ascending: true });

      // If user is a HEAD_COACH, filter by their academies
      if (!isGlobalSuperadmin && !hasRole('ADMIN_TENANT', tenant.id) && !hasRole('STAFF_ORGANIZACAO', tenant.id)) {
        // Get coach's academies where they are HEAD_COACH
        const { data: coachData } = await supabase
          .from('coaches')
          .select('id')
          .eq('profile_id', currentUser.id)
          .eq('tenant_id', tenant.id)
          .maybeSingle();

        if (coachData) {
          const { data: academyLinks } = await supabase
            .from('academy_coaches')
            .select('academy_id')
            .eq('coach_id', coachData.id)
            .eq('role', 'HEAD_COACH')
            .eq('is_active', true);

          if (academyLinks && academyLinks.length > 0) {
            const academyIds = academyLinks.map(l => l.academy_id);
            query = query.in('academy_id', academyIds);
          } else {
            // No academies to approve for
            return [];
          }
        } else {
          return [];
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as unknown as MembershipForApproval[];
    },
    enabled: !!tenant && !!currentUser && canApprove,
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!tenant) return null;

  if (!canApprove) {
    return (
      <AppShell>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-muted-foreground">Você não tem permissão para acessar esta página</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

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
              Aprovação de Filiações
            </h1>
            <p className="text-muted-foreground">
              Revise e aprove as filiações pendentes da {tenant.name}
            </p>
          </div>
          <Badge variant="outline" className="w-fit">
            <Clock className="h-3 w-3 mr-1" />
            {memberships?.length || 0} pendentes
          </Badge>
        </motion.div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <p className="text-muted-foreground">Erro ao carregar filiações pendentes</p>
            </CardContent>
          </Card>
        ) : memberships && memberships.length > 0 ? (
          <div className="grid gap-4">
            {memberships.map((membership, index) => (
              <motion.div
                key={membership.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card 
                  className="card-hover cursor-pointer group"
                  onClick={() => navigate(`/${tenantSlug}/app/approvals/${membership.id}`)}
                >
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
                        <Clock className="h-6 w-6 text-warning" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-medium flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            {membership.athlete?.full_name}
                          </h3>
                          <Badge variant="outline" className="text-xs">
                            #{membership.id.substring(0, 8).toUpperCase()}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-3">
                          {membership.athlete?.email}
                        </p>
                        
                        <div className="flex flex-wrap gap-2 mb-3">
                          <StatusBadge 
                            status={membership.status} 
                            label={MEMBERSHIP_STATUS_LABELS[membership.status]}
                          />
                          <StatusBadge 
                            status={membership.payment_status} 
                            label={PAYMENT_STATUS_LABELS[membership.payment_status]}
                          />
                          {membership.academy && (
                            <Badge variant="outline">
                              {membership.academy.name}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          Solicitado em {formatDate(membership.created_at)}
                        </div>
                      </div>

                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
                <ClipboardCheck className="h-8 w-8 text-success" />
              </div>
              <h3 className="font-display font-bold text-xl mb-2">Tudo em dia!</h3>
              <p className="text-muted-foreground text-sm max-w-md">
                Não há filiações pendentes de aprovação no momento.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
