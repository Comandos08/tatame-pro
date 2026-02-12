/**
 * ============================================================================
 * 📊 R-01D.4 — MEMBERSHIP FUNNEL INTELLIGENCE (SUPERADMIN ONLY)
 * ============================================================================
 *
 * Institutional analytics dashboard — visually aligned with SystemHealth.
 * Data source: membership_analytics table.
 * Access: SUPERADMIN_GLOBAL only (enforced by RequireGlobalRoles in App.tsx).
 *
 * NO mutations. NO polling. NO realtime. NO tenant filters.
 * ============================================================================
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, AlertTriangle, TrendingUp, RefreshCw, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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

const DROP_OFF_PAIRS = [
  { from: 'MEMBERSHIP_TYPE_VIEWED', to: 'MEMBERSHIP_TYPE_SELECTED', label: 'Viewed → Selected' },
  { from: 'MEMBERSHIP_TYPE_SELECTED', to: 'MEMBERSHIP_FORM_STARTED', label: 'Selected → Started' },
  { from: 'MEMBERSHIP_FORM_STARTED', to: 'MEMBERSHIP_PAYMENT_INITIATED', label: 'Started → Payment' },
  { from: 'MEMBERSHIP_PAYMENT_INITIATED', to: 'MEMBERSHIP_APPROVED', label: 'Payment → Approved' },
];

/* ── Main Component ── */

export default function AdminMembershipAnalytics() {
  const navigate = useNavigate();
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

  // Badge config
  const badgeConfig = status === 'empty' || status === 'loading' || status === 'error'
    ? { label: 'No Events Recorded', className: 'bg-destructive/10 text-destructive border-destructive/20' }
    : totalEvents < 10
      ? { label: 'Low Volume', className: 'bg-warning/10 text-warning border-warning/20' }
      : { label: 'Collecting Data', className: 'bg-success/10 text-success border-success/20' };

  // Conversion helpers (safe even when status !== ready)
  const totalStarted = get('MEMBERSHIP_FORM_STARTED');
  const totalApproved = get('MEMBERSHIP_APPROVED');
  const overallConversion = safePct(totalApproved, totalStarted);
  const maxFunnelVal = Math.max(...FUNNEL_STEPS.map((s) => get(s)), 1);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Sticky Header (identical pattern to SystemHealth) ── */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <TrendingUp className="h-6 w-6 text-primary" />
              <div>
                <h1 className="font-display text-lg font-bold">Membership Funnel</h1>
                <p className="text-xs text-muted-foreground">Monitor conversion lifecycle and growth performance</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
              badgeConfig.className,
            )}>
              {badgeConfig.label}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || status === 'loading'}
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', (isRefreshing || status === 'loading') && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="container mx-auto px-4 py-8 space-y-6">

        {/* Loading state */}
        {status === 'loading' && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading analytics…</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="flex items-center justify-center py-24">
            <Card className="max-w-md w-full">
              <CardHeader className="items-center text-center">
                <AlertTriangle className="h-10 w-10 text-destructive mb-2" />
                <CardTitle>Analytics Unavailable</CardTitle>
                <CardDescription>Unable to load membership funnel data. Please try again later.</CardDescription>
              </CardHeader>
            </Card>
          </div>
        )}

        {/* Empty state — banner + empty message inside full layout */}
        {status === 'empty' && (
          <>
            <div className="rounded-lg border border-border bg-muted/30 px-6 py-4 flex items-center gap-4">
              <TrendingUp className="h-8 w-8 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-display text-base font-semibold text-foreground">
                  System Ready — No Membership Activity Yet
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Tracking is active. Metrics will appear automatically as users progress through the membership flow.
                </p>
              </div>
            </div>
          </>
        )}

        {/* Ready state — full dashboard */}
        {status === 'ready' && (
          <>
            {/* Status Banner */}
            <div className="rounded-lg border border-success/20 bg-success/5 px-6 py-4 flex items-center gap-4">
              <TrendingUp className="h-8 w-8 shrink-0 text-success" />
              <div>
                <p className="font-display text-base font-semibold text-success">
                  Conversion Tracking Active
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {totalEvents} total tracked events across lifecycle stages.
                </p>
              </div>
            </div>

            {/* Section: Executive Summary */}
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                Executive Summary
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Total Sessions', value: String(totalStarted), desc: 'Form started events' },
                  { label: 'Payments Initiated', value: String(get('MEMBERSHIP_PAYMENT_INITIATED')), desc: 'Checkout attempts' },
                  { label: 'Approved Memberships', value: String(totalApproved), desc: 'Successfully approved' },
                  { label: 'Overall Conversion', value: `${overallConversion}%`, desc: 'Approved / Started' },
                ].map((m) => (
                  <Card key={m.label}>
                    <CardContent className="p-6 space-y-2">
                      <p className="text-sm text-muted-foreground">{m.label}</p>
                      <p className="text-2xl font-semibold text-foreground">{m.value}</p>
                      <p className="text-xs text-muted-foreground">{m.desc}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Section: Funnel Progression */}
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                Funnel Progression
              </h2>
              <Card>
                <CardContent className="p-6 space-y-3">
                  {FUNNEL_STEPS.map((step) => {
                    const count = get(step);
                    const pct = Math.round((count / maxFunnelVal) * 100);
                    return (
                      <div key={step} className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground w-32 text-right shrink-0">
                          {STEP_LABELS[step]}
                        </span>
                        <div className="flex-1 h-8 bg-muted/50 rounded-lg overflow-hidden relative">
                          <div
                            className="h-full bg-primary/15 rounded-lg transition-all"
                            style={{ width: `${Math.max(pct, 2)}%` }}
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
            </div>

            {/* Section: Conversion Diagnostics */}
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                Conversion Diagnostics
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
                    <Card key={pair.label}>
                      <CardContent className="p-6 space-y-2">
                        <p className="text-sm text-muted-foreground">{pair.label}</p>
                        <p className={cn('text-2xl font-semibold', severity)}>{dropStr}%</p>
                        <p className="text-xs text-muted-foreground">
                          {fromVal} → {toVal} ({fromVal - toVal} lost)
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
