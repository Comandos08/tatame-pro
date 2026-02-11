import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CreditCard, AlertTriangle, RefreshCw, Play, Loader2, 
  CheckCircle, XCircle, User, Building2, Calendar, ChevronDown, ChevronUp,
  FileWarning, Download
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface MembershipWithoutCard {
  id: string;
  status: string;
  payment_status: string;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  athlete: {
    id: string;
    full_name: string;
    email: string;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
}

interface DiagnosticsData {
  membershipsWithoutCard: MembershipWithoutCard[];
  totalPaidMemberships: number;
  totalDigitalCards: number;
  inconsistencyRate: number;
  recentFailures: {
    membershipId: string;
    error: string;
    createdAt: string;
  }[];
}

export function CardDiagnosticsPanel() {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [generatingCards, setGeneratingCards] = useState<Set<string>>(new Set());

  // Fetch diagnostics data
  const { data: diagnostics, isLoading, refetch } = useQuery({
    queryKey: ['card-diagnostics'],
    queryFn: async (): Promise<DiagnosticsData> => {
      // Get paid memberships without digital cards
      const { data: membershipsWithoutCard, error: membershipError } = await supabase
        .from('memberships')
        .select(`
          id,
          status,
          payment_status,
          created_at,
          start_date,
          end_date,
          athlete:athletes!inner(id, full_name, email),
          tenant:tenants!inner(id, name, slug)
        `)
        .eq('payment_status', 'PAID')
        .in('status', ['PENDING_REVIEW', 'APPROVED', 'ACTIVE']);

      if (membershipError) throw membershipError;

      // Get all digital cards
      const { data: digitalCards, error: cardError } = await supabase
        .from('digital_cards')
        .select('membership_id');

      if (cardError) throw cardError;

      // Find memberships without cards
      const cardMembershipIds = new Set(digitalCards?.map(c => c.membership_id) || []);
      const withoutCard = (membershipsWithoutCard || []).filter(
        m => !cardMembershipIds.has(m.id)
      ) as MembershipWithoutCard[];

      // Get total counts
      const totalPaidMemberships = membershipsWithoutCard?.length || 0;
      const totalDigitalCards = digitalCards?.length || 0;

      // Get recent card generation failures from audit logs
      const { data: failureLogs } = await supabase
        .from('audit_logs')
        .select('metadata, created_at')
        .eq('event_type', 'MEMBERSHIP_UPDATED')
        .order('created_at', { ascending: false })
        .limit(50);

      const recentFailures = (failureLogs || [])
        .filter((log) => {
          const metadata = log.metadata as Record<string, unknown> | null;
          return metadata?.action === 'card_generation_failed';
        })
        .slice(0, 10)
        .map((log) => {
          const metadata = log.metadata as Record<string, unknown>;
          return {
            membershipId: metadata.membership_id as string,
            error: metadata.error as string,
            createdAt: log.created_at,
          };
        });

      const inconsistencyRate = totalPaidMemberships > 0 
        ? (withoutCard.length / totalPaidMemberships) * 100 
        : 0;

      return {
        membershipsWithoutCard: withoutCard,
        totalPaidMemberships,
        totalDigitalCards,
        inconsistencyRate,
        recentFailures,
      };
    },
    staleTime: 60 * 1000, // 1 minute
  });

  // Generate card mutation
  const generateCardMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      setGeneratingCards(prev => new Set(prev).add(membershipId));
      
      const { data, error } = await supabase.functions.invoke('generate-digital-card', {
        body: { membershipId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Falha ao gerar carteirinha');
      
      return data;
    },
    onSuccess: (_, membershipId) => {
      toast.success('Carteirinha gerada com sucesso!');
      setGeneratingCards(prev => {
        const next = new Set(prev);
        next.delete(membershipId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['card-diagnostics'] });
    },
    onError: (error, membershipId) => {
      toast.error(`Erro ao gerar carteirinha: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      setGeneratingCards(prev => {
        const next = new Set(prev);
        next.delete(membershipId);
        return next;
      });
    },
  });

  // Generate all cards
  const generateAllMutation = useMutation({
    mutationFn: async () => {
      if (!diagnostics?.membershipsWithoutCard.length) return;
      
      const results = await Promise.allSettled(
        diagnostics.membershipsWithoutCard.map(m => 
          supabase.functions.invoke('generate-digital-card', {
            body: { membershipId: m.id },
          })
        )
      );

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      return { succeeded, failed };
    },
    onSuccess: (data) => {
      toast.success(`Processamento concluído: ${data?.succeeded} geradas, ${data?.failed} falhas`);
      queryClient.invalidateQueries({ queryKey: ['card-diagnostics'] });
    },
    onError: (error) => {
      toast.error(`Erro no processamento em lote: ${error instanceof Error ? error.message : 'Erro'}`);
    },
  });

  // Export CSV
  const handleExportCsv = () => {
    if (!diagnostics?.membershipsWithoutCard.length) return;

    const headers = ['ID', 'Atleta', 'Email', 'Organização', 'Status', 'Pagamento', 'Criado em'];
    const rows = diagnostics.membershipsWithoutCard.map(m => [
      m.id,
      m.athlete.full_name,
      m.athlete.email,
      m.tenant.name,
      m.status,
      m.payment_status,
      format(new Date(m.created_at), 'dd/MM/yyyy HH:mm'),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `memberships-sem-carteirinha-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-success text-success-foreground';
      case 'APPROVED': return 'bg-info text-info-foreground';
      case 'PENDING_REVIEW': return 'bg-warning text-warning-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const inconsistencyColor = diagnostics?.inconsistencyRate 
    ? diagnostics.inconsistencyRate > 10 
      ? 'text-destructive' 
      : diagnostics.inconsistencyRate > 5 
        ? 'text-warning' 
        : 'text-success'
    : 'text-muted-foreground';

  return (
    <Card className="mb-8">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Diagnóstico de Carteirinhas
                    {diagnostics && diagnostics.membershipsWithoutCard.length > 0 && (
                      <Badge variant="destructive" className="ml-2">
                        {diagnostics.membershipsWithoutCard.length} pendentes
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Monitoramento de memberships pagas sem carteirinha digital
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={(e) => { e.stopPropagation(); refetch(); }}
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
                {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : diagnostics ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">Memberships Pagas</p>
                    <p className="text-2xl font-bold">{diagnostics.totalPaidMemberships}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">Carteirinhas Geradas</p>
                    <p className="text-2xl font-bold">{diagnostics.totalDigitalCards}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">Sem Carteirinha</p>
                    <p className="text-2xl font-bold text-destructive">
                      {diagnostics.membershipsWithoutCard.length}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">Taxa de Inconsistência</p>
                    <p className={`text-2xl font-bold ${inconsistencyColor}`}>
                      {diagnostics.inconsistencyRate.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Consistency Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cobertura de Carteirinhas</span>
                    <span className="font-medium">
                      {diagnostics.totalPaidMemberships > 0 
                        ? (100 - diagnostics.inconsistencyRate).toFixed(1) 
                        : 100}%
                    </span>
                  </div>
                  <Progress 
                    value={diagnostics.totalPaidMemberships > 0 
                      ? 100 - diagnostics.inconsistencyRate 
                      : 100} 
                    className="h-2"
                  />
                </div>

                {/* Memberships without cards */}
                {diagnostics.membershipsWithoutCard.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-warning" />
                        Memberships Sem Carteirinha
                      </h4>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={handleExportCsv}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Exportar CSV
                        </Button>
                        <Button 
                          size="sm"
                          onClick={() => generateAllMutation.mutate()}
                          disabled={generateAllMutation.isPending}
                        >
                          {generateAllMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4 mr-2" />
                          )}
                          Gerar Todas ({diagnostics.membershipsWithoutCard.length})
                        </Button>
                      </div>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Atleta</TableHead>
                            <TableHead>Organização</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Criado em</TableHead>
                            <TableHead className="text-right">Ação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <AnimatePresence mode="popLayout">
                            {diagnostics.membershipsWithoutCard.slice(0, 20).map((membership) => (
                              <motion.tr
                                key={membership.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="border-b"
                              >
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                      <p className="font-medium text-sm">
                                        {membership.athlete.full_name}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {membership.athlete.email}
                                      </p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Building2 className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm">{membership.tenant.name}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge className={getStatusColor(membership.status)}>
                                    {membership.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Calendar className="h-4 w-4" />
                                    {format(new Date(membership.created_at), 'dd/MM/yyyy')}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => generateCardMutation.mutate(membership.id)}
                                        disabled={generatingCards.has(membership.id)}
                                      >
                                        {generatingCards.has(membership.id) ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Play className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Gerar Carteirinha</TooltipContent>
                                  </Tooltip>
                                </TableCell>
                              </motion.tr>
                            ))}
                          </AnimatePresence>
                        </TableBody>
                      </Table>
                      {diagnostics.membershipsWithoutCard.length > 20 && (
                        <div className="text-center py-2 text-sm text-muted-foreground bg-muted/30">
                          Mostrando 20 de {diagnostics.membershipsWithoutCard.length} registros
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Recent Failures */}
                {diagnostics.recentFailures.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold flex items-center gap-2">
                      <FileWarning className="h-4 w-4 text-destructive" />
                      Falhas Recentes de Geração
                    </h4>
                    <div className="space-y-2">
                      {diagnostics.recentFailures.map((failure, idx) => (
                        <div 
                          key={idx}
                          className="flex items-center justify-between bg-destructive/5 border border-destructive/20 rounded-lg px-4 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-destructive" />
                            <code className="text-xs bg-muted px-1 rounded">
                              {failure.membershipId.substring(0, 8)}...
                            </code>
                            <span className="text-muted-foreground">{failure.error}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(failure.createdAt), 'dd/MM HH:mm')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Success State */}
                {diagnostics.membershipsWithoutCard.length === 0 && (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-success mx-auto mb-4" />
                    <h4 className="font-semibold text-lg text-success">Tudo em ordem!</h4>
                    <p className="text-muted-foreground">
                      Todas as memberships pagas possuem carteirinha digital gerada.
                    </p>
                  </div>
                )}
              </motion.div>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
