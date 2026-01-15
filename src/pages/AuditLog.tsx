import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Clock, User, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { AppShell } from '@/layouts/AppShell';
import { supabase } from '@/integrations/supabase/client';

interface AuditLogEntry {
  id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  profile?: {
    name: string | null;
    email: string;
  } | null;
}

const eventTypeLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  MEMBERSHIP_CREATED: { label: 'Filiação Criada', variant: 'secondary' },
  MEMBERSHIP_PAID: { label: 'Pagamento Confirmado', variant: 'default' },
  MEMBERSHIP_APPROVED: { label: 'Filiação Aprovada', variant: 'default' },
  MEMBERSHIP_REJECTED: { label: 'Filiação Rejeitada', variant: 'destructive' },
  DIPLOMA_ISSUED: { label: 'Diploma Emitido', variant: 'default' },
  LOGIN_SUCCESS: { label: 'Login Realizado', variant: 'outline' },
  LOGIN_FAILED: { label: 'Login Falhou', variant: 'destructive' },
  GRADING_RECORDED: { label: 'Graduação Registrada', variant: 'default' },
};

export default function AuditLog() {
  const { tenant } = useTenant();
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      if (!tenant?.id) return;

      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          id,
          event_type,
          metadata,
          created_at,
          profile:profiles(name, email)
        `)
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        setLogs(data as unknown as AuditLogEntry[]);
      }
      setLoading(false);
    }

    fetchLogs();
  }, [tenant?.id]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getEventInfo = (type: string) => {
    return eventTypeLabels[type] || { label: type, variant: 'outline' as const };
  };

  return (
    <AppShell>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold">
                {t('audit.title')}
              </h1>
              <p className="text-muted-foreground">
                Histórico de atividades do sistema
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Eventos Recentes</CardTitle>
            <CardDescription>
              Últimos 100 eventos registrados no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">{t('audit.noEvents')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">{t('audit.timestamp')}</TableHead>
                      <TableHead className="w-[180px]">{t('audit.eventType')}</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>{t('audit.details')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => {
                      const eventInfo = getEventInfo(log.event_type);
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-sm">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              {formatDate(log.created_at)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={eventInfo.variant}>
                              {eventInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {log.profile ? (
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span>{log.profile.name || log.profile.email}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Sistema</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                            {log.metadata && Object.keys(log.metadata).length > 0 ? (
                              <span title={JSON.stringify(log.metadata, null, 2)}>
                                {Object.entries(log.metadata)
                                  .slice(0, 3)
                                  .map(([k, v]) => `${k}: ${v}`)
                                  .join(', ')}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AppShell>
  );
}
