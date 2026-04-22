/**
 * ============================================================================
 * 📊 R-01D.5 — INSTITUTIONAL INTELLIGENCE LAYOUT
 * ============================================================================
 *
 * Membership funnel analytics — institutional layout aligned with SystemHealth.
 * Access: SUPERADMIN_GLOBAL only (RequireGlobalRoles in App.tsx).
 *
 * NO mutations. NO polling. NO realtime. NO tenant filters.
 * ============================================================================
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, AlertTriangle, TrendingUp, RefreshCw, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
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

const DROP_OFF_PAIRS = [
  { from: 'MEMBERSHIP_TYPE_VIEWED', to: 'MEMBERSHIP_TYPE_SELECTED', label: 'Viewed → Selected' },
  { from: 'MEMBERSHIP_TYPE_SELECTED', to: 'MEMBERSHIP_FORM_STARTED', label: 'Selected → Started' },
  { from: 'MEMBERSHIP_FORM_STARTED', to: 'MEMBERSHIP_PAYMENT_INITIATED', label: 'Started → Payment' },
  { from: 'MEMBERSHIP_PAYMENT_INITIATED', to: 'MEMBERSHIP_APPROVED', label: 'Payment → Approved' },
];

type CountsMap = Record<string, number>;
type Status = 'loading' | 'error' | 'empty' | 'ready';

function safePct(numerator: number, denominator: number): string {
  if (denominator === 0) return '0.0';
  return ((numerator / denominator) * 100).toFixed(1);
}

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
  const totalStarted = get('MEMBERSHIP_FORM_STARTED');
  const totalApproved = get('MEMBERSHIP_APPROVED');
  const overallConversion = safePct(totalApproved, totalStarted);
  const maxFunnelVal = Math.max(...FUNNEL_STEPS.map((s) => get(s)), 1);

  const isReady = status === 'ready';

  const badgeConfig = status === 'empty' || status === 'loading' || status === 'error'
    ? { label: 'No Events Recorded', className: 'bg-destructive/10 text-destructive border-destructive/20' }
    : totalEvents < 10
      ? { label: 'Low Volume', className: 'bg-warning/10 text-warning border-warning/20' }
      : { label: 'Collecting Data', className: 'bg-success/10 text-success border-success/20' };

  return (
    <div className="flex flex-col h-full">

      {/* ── 1. Sticky Institutional Header ── */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="h-10 w-10 rounded-xl bg-primary/10 p-2 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Membership Funnel</h1>
              <p className="text-sm text-muted-foreground mt-1">Global conversion lifecycle monitoring</p>
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
      </div>

      {/* ── Scrollable Content ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">

      {/* ── 2. Loading indicator ── */}
      {status === 'loading' && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* ── 3. Error state ── */}
      {status === 'error' && (
        <Card className="rounded-xl">
          <CardContent className="p-6 flex items-center gap-4">
            <AlertTriangle className="h-8 w-8 text-destructive shrink-0" />
            <div>
              <p className="font-semibold text-foreground">Analytics Unavailable</p>
              <p className="text-sm text-muted-foreground mt-0.5">Unable to load membership funnel data. Please try again later.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 4. Status Banner ── */}
      {(status === 'empty' || status === 'ready') && (
        <div className="rounded-xl border border-border bg-muted p-5 flex items-center gap-4">
          <TrendingUp className={cn('h-5 w-5 shrink-0', isReady ? 'text-success' : 'text-muted-foreground')} />
          <div>
            <p className={cn('text-sm font-medium', isReady ? 'text-success' : 'text-foreground')}>
              {isReady ? 'Conversion Funnel Active' : 'System Ready — Awaiting Membership Activity'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {isReady
                ? `${totalEvents} lifecycle events recorded across membership stages.`
                : 'The analytics engine is active. Funnel metrics will populate automatically as users progress through the membership lifecycle.'}
            </p>
          </div>
        </div>
      )}

      {/* ── 5. Executive Summary (always render if not loading/error) ── */}
      {(status === 'empty' || status === 'ready') && (
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground mb-3">Executive Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: 'TOTAL SESSIONS', value: String(totalStarted), desc: 'Form started events' },
              { label: 'PAYMENTS INITIATED', value: String(get('MEMBERSHIP_PAYMENT_INITIATED')), desc: 'Checkout attempts' },
              { label: 'APPROVED MEMBERSHIPS', value: String(totalApproved), desc: 'Successfully approved' },
              { label: 'OVERALL CONVERSION', value: `${overallConversion}%`, desc: 'Approved / Started' },
            ].map((m) => (
              <Card key={m.label} className="rounded-xl hover:bg-muted/40 transition-colors">
                <CardContent className="p-6 space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</p>
                  <p className="text-3xl font-semibold text-foreground">{m.value}</p>
                  <p className="text-sm text-muted-foreground">{m.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── 6. Funnel Progression (always render if not loading/error) ── */}
      {(status === 'empty' || status === 'ready') && (
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground mb-1">Funnel Progression</h2>
          <p className="text-sm text-muted-foreground mb-3">Stage-by-stage membership lifecycle tracking.</p>
          <Card className="rounded-xl">
            <CardContent className="p-6 space-y-3">
              {FUNNEL_STEPS.map((step) => {
                const count = get(step);
                const pct = Math.round((count / maxFunnelVal) * 100);
                return (
                  <div key={step} className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground w-32 text-right shrink-0">
                      {STEP_LABELS[step]}
                    </span>
                    <div className="flex-1 h-8 bg-muted rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
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
      )}

      {/* ── 7. Conversion Diagnostics (always render if not loading/error) ── */}
      {(status === 'empty' || status === 'ready') && (
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground mb-1">Conversion Diagnostics</h2>
          <p className="text-sm text-muted-foreground mb-3">Stage transition performance analysis.</p>
          <Card className="rounded-xl">
            <CardContent className="p-6 divide-y divide-border">
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
                  <div key={pair.label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-foreground">{pair.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fromVal} → {toVal} ({fromVal - toVal} lost)
                      </p>
                    </div>
                    <p className={cn('text-2xl font-semibold', severity)}>{dropStr}%</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
      </div>
    </div>
  );
}
