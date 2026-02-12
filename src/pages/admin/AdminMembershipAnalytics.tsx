/**
 * ============================================================================
 * 📊 R-01D.3 — EXECUTIVE FUNNEL INTELLIGENCE PANEL (SUPERADMIN ONLY)
 * ============================================================================
 *
 * Global intelligence dashboard for membership conversion lifecycle.
 * Data source: membership_analytics table.
 * Access: SUPERADMIN_GLOBAL only (enforced by RequireGlobalRoles in App.tsx).
 *
 * NO mutations. NO polling. NO realtime. NO tenant filters.
 * ============================================================================
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, AlertTriangle, TrendingUp, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ── Constants ── */

const FUNNEL_STEPS = [
  'MEMBERSHIP_TYPE_VIEWED',
  'MEMBERSHIP_TYPE_SELECTED',
  'MEMBERSHIP_FORM_STARTED',
  'MEMBERSHIP_PAYMENT_INITIATED',
  'MEMBERSHIP_APPROVED',
  'MEMBERSHIP_PORTAL_ACCESSED',
] as const;

const STEP_LABELS: Record<string, string> = {
  MEMBERSHIP_TYPE_VIEWED: 'Type Viewed',
  MEMBERSHIP_TYPE_SELECTED: 'Type Selected',
  MEMBERSHIP_FORM_STARTED: 'Form Started',
  MEMBERSHIP_STEP_COMPLETED: 'Step Completed',
  MEMBERSHIP_PAYMENT_INITIATED: 'Payment Initiated',
  MEMBERSHIP_SUCCESS_PAGE_LOADED: 'Success Page Loaded',
  MEMBERSHIP_APPROVED: 'Approved',
  MEMBERSHIP_PORTAL_ACCESSED: 'Portal Accessed',
};

type CountsMap = Record<string, number>;
type Status = 'loading' | 'error' | 'empty' | 'ready';

function safePct(numerator: number, denominator: number): string {
  if (denominator === 0) return '0.0';
  return ((numerator / denominator) * 100).toFixed(1);
}

/* ── Drop-off pairs ── */

const DROP_OFF_PAIRS = [
  { from: 'MEMBERSHIP_TYPE_VIEWED', to: 'MEMBERSHIP_TYPE_SELECTED', label: 'Viewed → Selected' },
  { from: 'MEMBERSHIP_TYPE_SELECTED', to: 'MEMBERSHIP_FORM_STARTED', label: 'Selected → Started' },
  { from: 'MEMBERSHIP_FORM_STARTED', to: 'MEMBERSHIP_PAYMENT_INITIATED', label: 'Started → Payment' },
  { from: 'MEMBERSHIP_PAYMENT_INITIATED', to: 'MEMBERSHIP_APPROVED', label: 'Payment → Approved' },
];

/* ── Sub-components ── */

function InstitutionalHeader({ status, totalEvents, onRefresh, isRefreshing }: {
  status: Status;
  totalEvents: number;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const badgeConfig = status === 'empty'
    ? { label: 'No Events Recorded', className: 'bg-destructive/10 text-destructive border-destructive/20' }
    : totalEvents < 10
      ? { label: 'Low Volume', className: 'bg-warning/10 text-warning border-warning/20' }
      : { label: 'Collecting Data', className: 'bg-success/10 text-success border-success/20' };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-primary/10 p-2.5">
          <TrendingUp className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Membership Funnel</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Global conversion lifecycle monitoring</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', badgeConfig.className)}>
          {badgeConfig.label}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>
    </div>
  );
}

function StatusBanner({ status, totalEvents }: { status: Status; totalEvents: number }) {
  if (status === 'empty') {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-5 py-4 flex items-center gap-3">
        <TrendingUp className="h-5 w-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">System Ready — No Membership Activity Yet</p>
          <p className="text-xs text-muted-foreground mt-0.5">Tracking is active. Metrics will appear automatically as users progress.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-success/20 bg-success/5 px-5 py-4 flex items-center gap-3">
      <TrendingUp className="h-5 w-5 text-success shrink-0" />
      <div>
        <p className="text-sm font-medium text-success">Conversion Funnel Active</p>
        <p className="text-xs text-muted-foreground mt-0.5">{totalEvents} total tracked events across lifecycle stages.</p>
      </div>
    </div>
  );
}

function ExecutiveSummaryRow({ get }: { get: (key: string) => number }) {
  const totalStarted = get('MEMBERSHIP_FORM_STARTED');
  const totalApproved = get('MEMBERSHIP_APPROVED');
  const overallConversion = safePct(totalApproved, totalStarted);

  const metrics = [
    { label: 'Total Sessions', value: totalStarted, desc: 'Form started events' },
    { label: 'Payments Initiated', value: get('MEMBERSHIP_PAYMENT_INITIATED'), desc: 'Checkout attempts' },
    { label: 'Approved Memberships', value: totalApproved, desc: 'Successfully approved' },
    { label: 'Overall Conversion', value: `${overallConversion}%`, desc: 'Approved / Started' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {metrics.map((m) => (
        <Card key={m.label}>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">{m.label}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-foreground">{m.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FunnelVisualization({ get }: { get: (key: string) => number }) {
  const maxVal = Math.max(...FUNNEL_STEPS.map((s) => get(s)), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Funnel Progression</CardTitle>
        <CardDescription>Sequential stage-by-stage membership flow.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {FUNNEL_STEPS.map((step) => {
          const count = get(step);
          const pct = Math.round((count / maxVal) * 100);
          return (
            <div key={step} className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-28 text-right shrink-0">
                {STEP_LABELS[step]}
              </span>
              <div className="flex-1 h-7 bg-muted/50 rounded overflow-hidden relative">
                <div
                  className="h-full bg-primary/20 rounded transition-all"
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute inset-y-0 left-3 flex items-center text-xs font-medium text-foreground">
                  {count}
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DropOffDiagnostics({ get }: { get: (key: string) => number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conversion Diagnostics</CardTitle>
        <CardDescription>Stage-to-stage drop-off analysis.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DROP_OFF_PAIRS.map((pair) => {
            const fromVal = get(pair.from);
            const toVal = get(pair.to);
            const dropPct = fromVal === 0 ? 0 : ((fromVal - toVal) / fromVal) * 100;
            const dropStr = dropPct.toFixed(1);

            const severity = dropPct > 70
              ? 'text-destructive'
              : dropPct > 50
                ? 'text-warning'
                : 'text-foreground';

            return (
              <div key={pair.label} className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{pair.label}</p>
                <p className={cn('text-2xl font-semibold mt-1', severity)}>{dropStr}%</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {fromVal} → {toVal} ({fromVal - toVal} lost)
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Main Component ── */

export default function AdminMembershipAnalytics() {
  const [counts, setCounts] = useState<CountsMap>({});
  const [status, setStatus] = useState<Status>('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fetchedRef = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('membership_analytics')
        .select('event_name');

      if (error) { setStatus('error'); return; }
      if (!data || data.length === 0) { setStatus('empty'); return; }

      const map: CountsMap = {};
      for (const row of data) {
        map[row.event_name] = (map[row.event_name] || 0) + 1;
      }
      setCounts(map);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  }, [fetchData]);

  const get = (key: string) => counts[key] || 0;
  const totalEvents = Object.values(counts).reduce((a, b) => a + b, 0);

  /* Loading */
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading analytics…</p>
        </div>
      </div>
    );
  }

  /* Error */
  if (status === 'error') {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardHeader className="items-center text-center">
            <AlertTriangle className="h-10 w-10 text-destructive mb-2" />
            <CardTitle>Analytics Unavailable</CardTitle>
            <CardDescription>Unable to load membership funnel data. Please try again later.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  /* Empty */
  if (status === 'empty') {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="text-sm text-muted-foreground">Admin / Analytics / Membership Funnel</div>
        <InstitutionalHeader status={status} totalEvents={0} onRefresh={handleRefresh} isRefreshing={isRefreshing} />
        <StatusBanner status={status} totalEvents={0} />
      </div>
    );
  }

  /* Ready */
  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <div className="text-sm text-muted-foreground">Admin / Analytics / Membership Funnel</div>
      <InstitutionalHeader status={status} totalEvents={totalEvents} onRefresh={handleRefresh} isRefreshing={isRefreshing} />
      <StatusBanner status={status} totalEvents={totalEvents} />
      <ExecutiveSummaryRow get={get} />
      <FunnelVisualization get={get} />
      <DropOffDiagnostics get={get} />
    </div>
  );
}
