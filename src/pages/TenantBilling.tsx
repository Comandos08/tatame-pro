import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { AppShell } from '@/layouts/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';

interface TenantInvoice {
  id: string;
  stripe_invoice_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  created_at: string;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  paid: { label: 'Pago', variant: 'default' },
  open: { label: 'Aberto', variant: 'secondary' },
  draft: { label: 'Rascunho', variant: 'outline' },
  void: { label: 'Cancelado', variant: 'destructive' },
  uncollectible: { label: 'Não cobrável', variant: 'destructive' },
};

export default function TenantBilling() {
  const { tenant } = useTenant();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['tenant-invoices', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const { data, error } = await supabase
        .from('tenant_invoices')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as TenantInvoice[];
    },
    enabled: !!tenant?.id,
  });

  const formatCurrency = (cents: number, currency: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold mb-2 flex items-center gap-3">
            <CreditCard className="h-8 w-8" />
            Faturamento
          </h1>
          <p className="text-muted-foreground">
            Histórico de faturas e pagamentos da sua organização.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Histórico de Faturas
            </CardTitle>
            <CardDescription>
              Todas as faturas emitidas para sua organização
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : invoices && invoices.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pago em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => {
                    const status = statusConfig[invoice.status] || { label: invoice.status, variant: 'outline' as const };
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell>{formatDate(invoice.created_at)}</TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(invoice.amount_cents, invoice.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>{formatDate(invoice.paid_at)}</TableCell>
                        <TableCell className="text-right">
                          {invoice.hosted_invoice_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(invoice.hosted_invoice_url!, '_blank')}
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              Ver
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma fatura encontrada</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
