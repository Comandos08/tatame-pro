/**
 * TenantBilling — Billing Management Page
 * 
 * P3.3 — Billing UX Advanced Layer
 * PI P1.0 — Payments/Invoices SAFE GOLD Instrumentation
 * 
 * Composes:
 * - BillingOverviewCard (current status + CTAs)
 * - BillingTimeline (visual progression)
 * - Invoice history (existing)
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, ExternalLink, FileText, Loader2, TrendingUp, Clock, CalendarCheck } from 'lucide-react';
import { AppShell } from '@/layouts/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge, StatusType } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { BillingOverviewCard } from '@/components/billing/BillingOverviewCard';
import { BillingTimeline } from '@/components/billing/BillingTimeline';
import { assertInvoiceStatus } from '@/domain/payments/normalize';
import { formatDate, formatCurrency } from '@/lib/i18n/formatters';

// Map invoice status to StatusBadge status type
const invoiceStatusMap: Record<string, StatusType> = {
  paid: 'PAID',
  open: 'PENDING_PAYMENT',
  draft: 'DRAFT',
  void: 'CANCELLED',
  uncollectible: 'FAILED',
};

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

type StatusFilter = 'all' | 'open' | 'paid';

export default function TenantBilling() {
  const { tenant } = useTenant();
  const { t, locale } = useI18n();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');


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

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    if (statusFilter === 'all') return invoices;
    if (statusFilter === 'open') return invoices.filter(inv => ['open', 'draft'].includes(inv.status));
    if (statusFilter === 'paid') return invoices.filter(inv => inv.status === 'paid');
    return invoices;
  }, [invoices, statusFilter]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    if (!invoices) return { totalPaid: 0, totalPending: 0, nextInvoice: null as TenantInvoice | null, currency: 'BRL' };
    
    const currency = invoices[0]?.currency || 'BRL';
    const totalPaid = invoices
      .filter(inv => inv.status === 'paid')
      .reduce((sum, inv) => sum + inv.amount_cents, 0);
    
    const totalPending = invoices
      .filter(inv => ['open', 'draft'].includes(inv.status))
      .reduce((sum, inv) => sum + inv.amount_cents, 0);
    
    // Next invoice is the oldest open/draft invoice
    const nextInvoice = invoices
      .filter(inv => ['open', 'draft'].includes(inv.status))
      .sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      })[0] || null;
    
    return { totalPaid, totalPending, nextInvoice, currency };
  }, [invoices]);

  const viewState = isLoading ? 'LOADING' : 'READY';

  return (
    <AppShell>
      <div 
        className="space-y-6"
        data-testid="billing-root"
        data-billing-view-state={viewState}
      >
        {/* Header */}
        <div>
          <h1 className="font-display text-3xl font-bold mb-2 flex items-center gap-3">
            <CreditCard className="h-8 w-8" />
            {t('billing.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('billing.invoiceHistory')}
          </p>
        </div>

        {/* P3.3 — Billing Overview Card */}
        <BillingOverviewCard />

        {/* P3.3 — Billing Timeline */}
        <BillingTimeline />

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('billing.totalPaid')}</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                {formatCurrency(summaryStats.totalPaid, locale, summaryStats.currency)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('billing.totalPending')}</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">
                {formatCurrency(summaryStats.totalPending, locale, summaryStats.currency)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('billing.nextInvoice')}</CardTitle>
              <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {summaryStats.nextInvoice ? (
                <div>
                  <div className="text-2xl font-bold">
                    {formatCurrency(summaryStats.nextInvoice.amount_cents, locale, summaryStats.nextInvoice.currency)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('billing.dueDate')}: {formatDate(summaryStats.nextInvoice.due_date, locale, { dateStyle: 'medium' })}
                  </p>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">{t('billing.noOpenInvoices')}</div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t('billing.invoiceHistory')}
                </CardTitle>
                <CardDescription className="mt-1">
                  {t('billing.invoiceHistory')}
                </CardDescription>
              </div>
              <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <TabsList>
                  <TabsTrigger value="all">{t('billing.filterAll')}</TabsTrigger>
                  <TabsTrigger value="open">{t('billing.filterOpen')}</TabsTrigger>
                  <TabsTrigger value="paid">{t('billing.filterPaid')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredInvoices && filteredInvoices.length > 0 ? (
              <Table data-testid="invoice-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('billing.date')}</TableHead>
                    <TableHead>{t('billing.amount')}</TableHead>
                    <TableHead>{t('billing.status')}</TableHead>
                    <TableHead>{t('billing.filterPaid')}</TableHead>
                    <TableHead className="text-right">{t('billing.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => {
                    const statusType = invoiceStatusMap[invoice.status] || 'neutral';
                    const safeStatus = assertInvoiceStatus(invoice.status);
                    return (
                      <TableRow 
                        key={invoice.id}
                        data-testid="invoice-row"
                        data-invoice-id={invoice.id}
                        data-invoice-status={safeStatus}
                        data-invoice-amount={invoice.amount_cents}
                      >
                        <TableCell>{formatDate(invoice.created_at, locale, { dateStyle: 'medium' })}</TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(invoice.amount_cents, locale, invoice.currency)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={statusType} size="sm" />
                        </TableCell>
                        <TableCell>{formatDate(invoice.paid_at, locale, { dateStyle: 'medium' })}</TableCell>
                        <TableCell className="text-right">
                          {invoice.hosted_invoice_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(invoice.hosted_invoice_url!, '_blank')}
                              data-testid="invoice-view-stripe"
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              {t('billing.viewInStripe')}
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
                <p className="text-muted-foreground">{t('billing.noInvoices')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
