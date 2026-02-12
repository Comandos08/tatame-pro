/**
 * ============================================================================
 * 📊 R-01D — MEMBERSHIP FUNNEL DASHBOARD (SUPERADMIN ONLY)
 * ============================================================================
 *
 * Read-only analytics dashboard for membership funnel events.
 * Data source: membership_analytics table.
 * Access: SUPERADMIN_GLOBAL only (enforced by RequireGlobalRoles in App.tsx).
 *
 * NO mutations. NO polling. NO realtime. NO tenant filters.
 * ============================================================================
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, BarChart3, ArrowDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

/** Ordered funnel steps */
const FUNNEL_STEPS = [
  'MEMBERSHIP_TYPE_VIEWED',
  'MEMBERSHIP_TYPE_SELECTED',
  'MEMBERSHIP_FORM_STARTED',
  'MEMBERSHIP_STEP_COMPLETED',
  'MEMBERSHIP_PAYMENT_INITIATED',
  'MEMBERSHIP_SUCCESS_PAGE_LOADED',
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

export default function AdminMembershipAnalytics() {
  const [counts, setCounts] = useState<CountsMap>({});
  const [status, setStatus] = useState<Status>('loading');
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    (async () => {
      try {
        const { data, error } = await supabase
          .from('membership_analytics')
          .select('event_name');

        if (error) {
          setStatus('error');
          return;
        }

        if (!data || data.length === 0) {
          setStatus('empty');
          return;
        }

        // Aggregate counts client-side (RPC not needed for simple counts)
        const map: CountsMap = {};
        for (const row of data) {
          map[row.event_name] = (map[row.event_name] || 0) + 1;
        }
        setCounts(map);
        setStatus('ready');
      } catch {
        setStatus('error');
      }
    })();
  }, []);

  const get = (key: string) => counts[key] || 0;

  // --- Loading ---
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading analytics…</p>
        </div>
      </div>
    );
  }

  // --- Error ---
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full">
          <CardHeader className="items-center text-center">
            <AlertTriangle className="h-10 w-10 text-destructive mb-2" />
            <CardTitle>Analytics Unavailable</CardTitle>
            <CardDescription>
              Unable to load membership funnel data. Please try again later.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // --- Empty ---
  if (status === 'empty') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full">
          <CardHeader className="items-center text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground mb-2" />
            <CardTitle>No Data Yet</CardTitle>
            <CardDescription>
              No membership funnel events have been recorded. Events will appear here as users interact with the membership flow.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // --- Conversion metrics ---
  const conversions = [
    { label: 'Selection Rate', value: safePct(get('MEMBERSHIP_TYPE_SELECTED'), get('MEMBERSHIP_TYPE_VIEWED')), desc: 'Selected / Viewed' },
    { label: 'Form Completion Rate', value: safePct(get('MEMBERSHIP_STEP_COMPLETED'), get('MEMBERSHIP_FORM_STARTED')), desc: 'Completed / Started' },
    { label: 'Payment Rate', value: safePct(get('MEMBERSHIP_PAYMENT_INITIATED'), get('MEMBERSHIP_FORM_STARTED')), desc: 'Payment / Started' },
    { label: 'Approval Rate', value: safePct(get('MEMBERSHIP_APPROVED'), get('MEMBERSHIP_PAYMENT_INITIATED')), desc: 'Approved / Payment' },
    { label: 'Portal Access Rate', value: safePct(get('MEMBERSHIP_PORTAL_ACCESSED'), get('MEMBERSHIP_APPROVED')), desc: 'Portal / Approved' },
  ];

  // Visual funnel steps (linear progression)
  const funnelSteps = [
    'MEMBERSHIP_TYPE_VIEWED',
    'MEMBERSHIP_TYPE_SELECTED',
    'MEMBERSHIP_FORM_STARTED',
    'MEMBERSHIP_PAYMENT_INITIATED',
    'MEMBERSHIP_APPROVED',
    'MEMBERSHIP_PORTAL_ACCESSED',
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Membership Funnel Analytics</h1>
          <p className="text-muted-foreground mt-1">Aggregate event counts from the membership flow.</p>
        </div>

        {/* SECTION 1 — Funnel Overview Cards */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">Funnel Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {FUNNEL_STEPS.map((step) => (
              <Card key={step}>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">{STEP_LABELS[step]}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-foreground">{get(step)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* SECTION 2 — Conversion Metrics */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">Conversion Metrics</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {conversions.map((c) => (
              <Card key={c.label}>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">{c.label}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-foreground">{c.value}%</p>
                  <p className="text-xs text-muted-foreground mt-1">{c.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* SECTION 3 — Visual Funnel */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">Visual Funnel</h2>
          <Card>
            <CardContent className="py-6">
              <div className="flex flex-col items-center gap-1">
                {funnelSteps.map((step, i) => (
                  <div key={step} className="flex flex-col items-center">
                    <div className="flex items-center gap-3 py-2">
                      <span className="text-sm font-medium text-foreground w-48 text-right">
                        {STEP_LABELS[step]}
                      </span>
                      <span className="text-lg font-bold text-foreground w-16 text-center">
                        {get(step)}
                      </span>
                    </div>
                    {i < funnelSteps.length - 1 && (
                      <ArrowDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
