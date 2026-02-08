/**
 * PI-D4-SUPERADMIN1.0 — Admin Audit Log Page
 * 
 * Read-only view of audit events for SUPERADMIN_GLOBAL users.
 * Filters: event type, tenant, period, document type
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, Search, Filter, Calendar, Building2, 
  FileText, User, Clock, RefreshCw, Shield, AlertTriangle,
  CreditCard, Users, ChevronDown
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';
import { LoadingState } from '@/components/ux';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import { useI18n } from '@/contexts/I18nContext';
import { formatDate, formatDateTime } from '@/lib/i18n/formatters';

// PI-D4-AUDIT1.0 + PI-D5: Closed list of critical events
const CRITICAL_EVENTS = [
  'TENANT_CREATED',
  'TENANT_CREATED_VIA_WIZARD',
  'TENANT_STATUS_CHANGED',
  'BILLING_STATUS_CHANGED',
  'DOCUMENT_ISSUED',
  'DOCUMENT_REVOKED',
  'DOCUMENT_VERIFIED_PUBLIC',
  'IMPERSONATION_STARTED',
  'IMPERSONATION_ENDED',
  'SUPERADMIN_ACTION',
  'TENANT_BILLING_UPDATED',
  'DIPLOMA_ISSUED',
  'DIPLOMA_REVOKED',
  'DIGITAL_CARD_GENERATED',
  'ROLES_GRANTED',
  'ROLES_REVOKED',
  // PI-D5: Federation events
  'FEDERATION_CREATED',
  'FEDERATION_STATUS_CHANGED',
  'TENANT_JOINED_FEDERATION',
  'TENANT_LEFT_FEDERATION',
  'FEDERATION_ROLE_ASSIGNED',
  'FEDERATION_ROLE_REVOKED',
  // PI-D5: Council events
  'COUNCIL_CREATED',
  'COUNCIL_MEMBER_ADDED',
  'COUNCIL_MEMBER_REMOVED',
  'COUNCIL_DECISION_CREATED',
  'COUNCIL_DECISION_APPROVED',
  'COUNCIL_DECISION_REJECTED',
] as const;

// Event category colors
const EVENT_CATEGORY_COLORS: Record<string, string> = {
  TENANT: 'bg-primary/10 text-primary border-primary/20',
  BILLING: 'bg-success/10 text-success border-success/20',
  DOCUMENT: 'bg-info/10 text-info border-info/20',
  IMPERSONATION: 'bg-warning/10 text-warning border-warning/20',
  SUPERADMIN: 'bg-destructive/10 text-destructive border-destructive/20',
  SECURITY: 'bg-destructive/10 text-destructive border-destructive/20',
  ROLES: 'bg-primary/10 text-primary border-primary/20',
  FEDERATION: 'bg-primary/10 text-primary border-primary/20',
  COUNCIL: 'bg-info/10 text-info border-info/20',
  OTHER: 'bg-muted text-muted-foreground',
};

// Get category from event type
function getEventCategory(eventType: string): string {
  if (eventType.startsWith('FEDERATION_') || eventType.startsWith('TENANT_JOINED_') || eventType.startsWith('TENANT_LEFT_')) return 'FEDERATION';
  if (eventType.startsWith('COUNCIL_')) return 'COUNCIL';
  if (eventType.startsWith('TENANT_')) return 'TENANT';
  if (eventType.startsWith('BILLING_')) return 'BILLING';
  if (eventType.startsWith('DOCUMENT_') || eventType.startsWith('DIPLOMA_') || eventType.startsWith('DIGITAL_CARD_')) return 'DOCUMENT';
  if (eventType.startsWith('IMPERSONATION_')) return 'IMPERSONATION';
  if (eventType.startsWith('SUPERADMIN_')) return 'SUPERADMIN';
  if (eventType.startsWith('ROLES_')) return 'ROLES';
  return 'OTHER';
}

// Get icon for event category
function getEventIcon(eventType: string) {
  const category = getEventCategory(eventType);
  switch (category) {
    case 'TENANT': return Building2;
    case 'BILLING': return CreditCard;
    case 'DOCUMENT': return FileText;
    case 'IMPERSONATION': return Users;
    case 'SUPERADMIN': return Shield;
    case 'SECURITY': return AlertTriangle;
    case 'FEDERATION': return Building2;
    case 'COUNCIL': return Users;
    case 'ROLES': return User;
    default: return Clock;
  }
}

interface AuditLogEntry {
  id: string;
  event_type: string;
  tenant_id: string | null;
  profile_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  category: string | null;
}

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
}

export default function AuditLog() {
  const navigate = useNavigate();
  const { isGlobalSuperadmin, isLoading: authLoading } = useCurrentUser();
  const { locale } = useI18n();
  
  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<string>('all');
  const [selectedTenant, setSelectedTenant] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [limit, setLimit] = useState(50);

  // Redirect if not superadmin
  React.useEffect(() => {
    if (!authLoading && !isGlobalSuperadmin) {
      navigate('/portal');
    }
  }, [isGlobalSuperadmin, authLoading, navigate]);

  // Fetch tenants for filter
  const { data: tenants } = useQuery({
    queryKey: ['admin-tenants-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug')
        .order('name');
      if (error) throw error;
      return data as TenantInfo[];
    },
    enabled: isGlobalSuperadmin,
  });

  // Fetch audit logs
  const { data: auditLogs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-audit-logs', selectedEvent, selectedTenant, selectedCategory, dateRange, limit],
    queryFn: async () => {
      let query = supabase
        .from('audit_logs')
        .select('id, event_type, tenant_id, profile_id, metadata, created_at, category')
        .gte('created_at', startOfDay(dateRange.from).toISOString())
        .lte('created_at', endOfDay(dateRange.to).toISOString())
        .order('created_at', { ascending: false })
        .limit(limit);

      // Event type filter
      if (selectedEvent !== 'all') {
        query = query.eq('event_type', selectedEvent);
      } else {
        // Only show critical events
        query = query.in('event_type', CRITICAL_EVENTS as unknown as string[]);
      }

      // Tenant filter
      if (selectedTenant !== 'all') {
        query = query.eq('tenant_id', selectedTenant);
      }

      // Category filter
      if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AuditLogEntry[];
    },
    enabled: isGlobalSuperadmin,
    staleTime: 30000, // 30 seconds
  });

  // Create tenant map for display
  const tenantMap = useMemo(() => {
    const map = new Map<string, TenantInfo>();
    tenants?.forEach(t => map.set(t.id, t));
    return map;
  }, [tenants]);

  // Filter logs by search term
  const filteredLogs = useMemo(() => {
    if (!auditLogs) return [];
    if (!searchTerm) return auditLogs;
    
    const lower = searchTerm.toLowerCase();
    return auditLogs.filter(log => {
      const tenant = log.tenant_id ? tenantMap.get(log.tenant_id) : null;
      return (
        log.event_type.toLowerCase().includes(lower) ||
        tenant?.name.toLowerCase().includes(lower) ||
        JSON.stringify(log.metadata).toLowerCase().includes(lower)
      );
    });
  }, [auditLogs, searchTerm, tenantMap]);

  // Stats
  const stats = useMemo(() => {
    if (!auditLogs) return { total: 0, byCategory: {} as Record<string, number> };
    
    const byCategory: Record<string, number> = {};
    auditLogs.forEach(log => {
      const cat = getEventCategory(log.event_type);
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    return { total: auditLogs.length, byCategory };
  }, [auditLogs]);

  if (authLoading) {
    return <LoadingState titleKey="common.loading" variant="fullscreen" />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/admin')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-display text-lg font-bold flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Audit Log
              </h1>
              <p className="text-xs text-muted-foreground">
                PI-D4-AUDIT1.0 — Eventos críticos do sistema
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Stats Cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>
            {Object.entries(stats.byCategory).slice(0, 4).map(([cat, count]) => (
              <Card key={cat}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">{cat}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{count}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filtros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Event Type */}
                <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo de evento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os eventos</SelectItem>
                    {CRITICAL_EVENTS.map(event => (
                      <SelectItem key={event} value={event}>
                        {event}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Tenant */}
                <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tenants</SelectItem>
                    {tenants?.map(tenant => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Category */}
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    <SelectItem value="TENANT">TENANT</SelectItem>
                    <SelectItem value="BILLING">BILLING</SelectItem>
                    <SelectItem value="DOCUMENT">DOCUMENT</SelectItem>
                    <SelectItem value="IMPERSONATION">IMPERSONATION</SelectItem>
                    <SelectItem value="SECURITY">SECURITY</SelectItem>
                    <SelectItem value="ROLES">ROLES</SelectItem>
                    <SelectItem value="FEDERATION">FEDERATION</SelectItem>
                    <SelectItem value="COUNCIL">COUNCIL</SelectItem>
                  </SelectContent>
                </Select>

                {/* Date Range */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal">
                      <Calendar className="h-4 w-4 mr-2" />
                      {formatDate(dateRange.from, locale, { dateStyle: 'short' })} - {formatDate(dateRange.to, locale, { dateStyle: 'short' })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="range"
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      defaultMonth={dateRange.from}
                      onSelect={(range) => {
                        if (range?.from && range?.to) {
                          setDateRange({ from: range.from, to: range.to });
                        }
                      }}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          {/* Audit Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Eventos ({filteredLogs.length})
              </CardTitle>
              <CardDescription>
                Exibindo os últimos {limit} eventos críticos no período selecionado
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <LoadingState titleKey="common.loading" />
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhum evento encontrado no período</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">Data/Hora</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>Tenant</TableHead>
                        <TableHead>Alvo</TableHead>
                        <TableHead>Ator</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => {
                        const tenant = log.tenant_id ? tenantMap.get(log.tenant_id) : null;
                        const category = getEventCategory(log.event_type);
                        const Icon = getEventIcon(log.event_type);
                        const metadata = log.metadata as Record<string, unknown> | null;

                        return (
                          <TableRow key={log.id}>
                            <TableCell className="font-mono text-xs">
                              {formatDateTime(log.created_at, locale)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded ${EVENT_CATEGORY_COLORS[category]}`}>
                                  <Icon className="h-3.5 w-3.5" />
                                </div>
                                <Badge 
                                  variant="outline" 
                                  className={EVENT_CATEGORY_COLORS[category]}
                                >
                                  {log.event_type}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              {tenant ? (
                                <span className="text-sm">{tenant.name}</span>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {metadata?.document_type && (
                                <span>{String(metadata.document_type)}</span>
                              )}
                              {metadata?.target_tenant_name && (
                                <span>{String(metadata.target_tenant_name)}</span>
                              )}
                              {metadata?.membership_id && (
                                <span className="font-mono">
                                  {String(metadata.membership_id).slice(0, 8)}...
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {log.profile_id ? (
                                <span className="font-mono text-muted-foreground">
                                  {log.profile_id.slice(0, 8)}...
                                </span>
                              ) : metadata?.superadmin_user_id ? (
                                <Badge variant="outline" className="text-xs">
                                  SUPERADMIN
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">Sistema</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Load More */}
              {filteredLogs.length >= limit && (
                <div className="mt-4 text-center">
                  <Button 
                    variant="outline" 
                    onClick={() => setLimit(l => l + 50)}
                  >
                    <ChevronDown className="h-4 w-4 mr-2" />
                    Carregar mais
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
