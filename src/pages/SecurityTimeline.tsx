/**
 * 🔐 Security Timeline - Read-only Security Observability
 * 
 * Displays unified security decisions and events for admin monitoring.
 * - Admin Tenant: sees only own tenant's events
 * - Superadmin: sees all events across tenants
 * - Read-only: no mutations allowed
 */

import React, { useState, useEffect } from 'react';
import { Shield, Clock, Filter, Loader2, AlertCircle, Ban, Lock, User, ChevronDown, RefreshCw } from 'lucide-react';
import { AppShell } from '@/layouts/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { formatSecurityEvent, getSeverityVariant, SecurityTimelineEntry } from '@/lib/formatSecurityEvent';
import { formatDateTime, formatRelativeTime } from '@/lib/i18n/formatters';

const ITEMS_PER_PAGE = 25;

type SeverityFilter = 'all' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type SourceFilter = 'all' | 'DECISION' | 'EVENT';

const EventIcon = ({ icon }: { icon: string }) => {
  switch (icon) {
    case 'clock': return <Clock className="h-4 w-4" />;
    case 'ban': return <Ban className="h-4 w-4" />;
    case 'lock': return <Lock className="h-4 w-4" />;
    case 'user': return <User className="h-4 w-4" />;
    case 'alert': return <AlertCircle className="h-4 w-4" />;
    default: return <Shield className="h-4 w-4" />;
  }
};

export default function SecurityTimeline() {
  const { tenant } = useTenant();
  const { t, locale } = useI18n();

  const [events, setEvents] = useState<SecurityTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [operationSearch, setOperationSearch] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchEvents = async (reset = false) => {
    if (!tenant?.id) return;
    
    setLoading(true);
    setError(null);

    try {
      // Build query for decision_logs
      let decisionQuery = supabase
        .from('decision_logs')
        .select('id, decision_type, severity, operation, user_id, tenant_id, reason_code, metadata, created_at')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });

      // Build query for security_events
      let eventsQuery = supabase
        .from('security_events')
        .select('id, event_type, severity, operation, user_id, tenant_id, ip_address, user_agent, metadata, created_at')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });

      // Apply severity filter
      if (severityFilter !== 'all') {
        decisionQuery = decisionQuery.eq('severity', severityFilter);
        eventsQuery = eventsQuery.eq('severity', severityFilter);
      }

      // Apply operation search
      if (operationSearch) {
        decisionQuery = decisionQuery.ilike('operation', `%${operationSearch}%`);
        eventsQuery = eventsQuery.ilike('operation', `%${operationSearch}%`);
      }

      // Pagination
      const offset = reset ? 0 : page * ITEMS_PER_PAGE;
      decisionQuery = decisionQuery.range(offset, offset + ITEMS_PER_PAGE - 1);
      eventsQuery = eventsQuery.range(offset, offset + ITEMS_PER_PAGE - 1);

      // Fetch based on source filter
      let combined: SecurityTimelineEntry[] = [];

      if (sourceFilter === 'all' || sourceFilter === 'DECISION') {
        const { data: decisions, error: decisionError } = await decisionQuery;
        if (decisionError) throw decisionError;
        
        const mappedDecisions: SecurityTimelineEntry[] = (decisions || []).map(d => ({
          id: d.id,
          source: 'DECISION' as const,
          event_type: d.decision_type,
          severity: d.severity as SecurityTimelineEntry['severity'],
          operation: d.operation,
          user_id: d.user_id,
          tenant_id: d.tenant_id,
          reason_code: d.reason_code,
          ip_address: null,
          user_agent: null,
          metadata: d.metadata as Record<string, unknown> | null,
          created_at: d.created_at,
        }));
        combined = [...combined, ...mappedDecisions];
      }

      if (sourceFilter === 'all' || sourceFilter === 'EVENT') {
        const { data: secEvents, error: eventError } = await eventsQuery;
        if (eventError) throw eventError;
        
        const mappedEvents: SecurityTimelineEntry[] = (secEvents || []).map(e => ({
          id: e.id,
          source: 'EVENT' as const,
          event_type: e.event_type,
          severity: e.severity as SecurityTimelineEntry['severity'],
          operation: e.operation,
          user_id: e.user_id,
          tenant_id: e.tenant_id,
          reason_code: null,
          ip_address: e.ip_address,
          user_agent: e.user_agent,
          metadata: e.metadata as Record<string, unknown> | null,
          created_at: e.created_at,
        }));
        combined = [...combined, ...mappedEvents];
      }

      // Sort by created_at descending
      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Limit to page size
      combined = combined.slice(0, ITEMS_PER_PAGE);

      setHasMore(combined.length === ITEMS_PER_PAGE);

      if (reset) {
        setEvents(combined);
        setPage(0);
      } else {
        setEvents(prev => [...prev, ...combined]);
      }
    } catch (err) {
      console.error('Error fetching security timeline:', err);
      setError('Failed to load security events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents(true);
  }, [tenant?.id, severityFilter, sourceFilter, operationSearch]);

  const handleRefresh = () => {
    fetchEvents(true);
  };

  const handleLoadMore = () => {
    setPage(p => p + 1);
    fetchEvents(false);
  };

  return (
    <AppShell>
      <div className="container max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t('security.title') || 'Security Timeline'}</h1>
              <p className="text-sm text-muted-foreground">
                {t('security.description') || 'Monitor security decisions and events'}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh') || 'Refresh'}
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Input
                  placeholder={t('security.searchOperation') || 'Search by operation...'}
                  value={operationSearch}
                  onChange={(e) => setOperationSearch(e.target.value)}
                  className="w-full"
                />
              </div>
              <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as SeverityFilter)}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder={t('security.severity') || 'Severity'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all') || 'All'}</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder={t('security.source') || 'Source'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all') || 'All'}</SelectItem>
                  <SelectItem value="DECISION">{t('security.decisions') || 'Decisions'}</SelectItem>
                  <SelectItem value="EVENT">{t('security.events') || 'Events'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              {t('security.recentActivity') || 'Recent Activity'}
            </CardTitle>
            <CardDescription>
              {events.length} {t('security.eventsFound') || 'events found'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && events.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-12 w-12 text-destructive/50 mb-4" />
                <p className="text-destructive">{error}</p>
              </div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">{t('security.noEvents') || 'No security events found'}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {events.map((entry) => {
                  const formatted = formatSecurityEvent(entry);
                  return (
                    <div
                      key={`${entry.source}-${entry.id}`}
                      className="flex gap-4 p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                    >
                      {/* Icon */}
                      <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center border ${formatted.severityColor}`}>
                        <EventIcon icon={formatted.icon} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{formatted.title}</span>
                              <Badge variant={getSeverityVariant(entry.severity)} className="text-xs">
                                {entry.severity}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {entry.source}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {formatted.description}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatRelativeTime(entry.created_at, locale)}
                          </span>
                        </div>

                        {/* Details */}
                        {formatted.details.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {formatted.details.map((detail, idx) => (
                              <span
                                key={idx}
                                className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground"
                              >
                                {detail}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Timestamp */}
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDateTime(entry.created_at, locale)}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* Load More */}
                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={handleLoadMore} disabled={loading}>
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <ChevronDown className="h-4 w-4 mr-2" />
                      )}
                      {t('common.loadMore') || 'Load More'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
