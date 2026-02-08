

# P4.2 — OBSERVABILITY.REALTIME (SAFE GOLD)

## Diagnóstico do Codebase Atual

### Infraestrutura Existente

| Componente | Estado | Localização |
|------------|--------|-------------|
| **AlertContext** | ✅ Funcional (polling 5min) | `src/contexts/AlertContext.tsx` |
| **AlertBadge** | ✅ Simples | `src/components/observability/AlertBadge.tsx` |
| **AlertsPanel** | ✅ Sheet com dismiss | `src/components/observability/AlertsPanel.tsx` |
| **AdminHealthDashboard** | ✅ Read-only | `src/pages/AdminHealthDashboard.tsx` |
| **observability_critical_events** | ✅ View SQL | Migração anterior |
| **AppProviders** | ❌ Sem AlertProvider | `src/contexts/AppProviders.tsx` |
| **Realtime channels** | ❌ Nenhum | - |
| **notify-critical-alert** | ❌ Não existe | - |

### Gaps Identificados

1. **AlertProvider não está no AppProviders** — precisa adicionar
2. **Nenhum realtime configurado** — audit_logs não está em supabase_realtime
3. **Sem idempotência** — duplicatas possíveis se realtime + polling colidem
4. **Sem indicador de conexão** — UX não mostra estado da conexão

---

## Arquitetura P4.2

```text
┌───────────────────────────────────────────────────────────────┐
│              SUPABASE REALTIME (INSERT only)                  │
│  audit_logs (filtered by severity/category)                   │
└──────────────────────────────┬────────────────────────────────┘
                               │ postgres_changes
                               ▼
┌───────────────────────────────────────────────────────────────┐
│              REALTIME ADAPTER                                  │
│  subscribeObservabilityRealtime()                              │
│   - Supabase channel                                           │
│   - INSERT filter (server-side if possible)                    │
│   - Client-side severity filter                                │
│   - Idempotency cache (seen IDs, 1h TTL)                       │
│   - Returns unsubscribe() callback                             │
└──────────────────────────────┬────────────────────────────────┘
                               │ onEvent callback
                               ▼
┌───────────────────────────────────────────────────────────────┐
│              AlertContext (Upgraded)                           │
│  NEW: isRealtimeConnected                                      │
│  NEW: lastRealtimeEventAt                                      │
│  NEW: newEventsCount                                           │
│  NEW: markNewEventsAsSeen()                                    │
│  KEPT: polling fallback (5 min)                                │
│  KEPT: dismissedIds persistence (localStorage)                 │
└──────────────────────────────┬────────────────────────────────┘
                               │
                               ▼
┌───────────────────────────────────────────────────────────────┐
│              UI COMPONENTS                                     │
│  AlertBadge: + "live" indicator                                │
│  AlertsPanel: + "X new events" header + "mark seen" button     │
│  AdminHealthDashboard: + AlertsPanel integration               │
└───────────────────────────────────────────────────────────────┘
```

---

## Tarefas de Implementação

### P4.2.A — REALTIME.CORE (Subscriptions)

#### Tarefa A.1: Habilitar Realtime para audit_logs

**Migração SQL:**
```sql
-- Enable realtime for audit_logs (INSERT events only)
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;

-- Optional: Also enable for decision_logs if needed
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.decision_logs;
```

**SAFE GOLD:** Apenas INSERT é usado. Nenhum UPDATE/DELETE exposto.

#### Tarefa A.2: Criar Realtime Adapter

**Arquivo:** `src/lib/observability/realtime.ts`

```typescript
/**
 * 🔔 Observability Realtime Adapter — P4.2.A
 * 
 * Subscribes to real-time observability events from Supabase.
 * Uses idempotency cache to prevent duplicates.
 * Returns unsubscribe callback for cleanup.
 */

import { supabase } from '@/integrations/supabase/client';
import { Alert, EventSeverity } from '@/types/observability';

// LRU-style cache for seen event IDs (1h TTL)
const SEEN_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const seenEventsCache = new Map<string, number>();

// Cleanup old entries periodically
function cleanupSeenCache() {
  const now = Date.now();
  for (const [id, timestamp] of seenEventsCache) {
    if (now - timestamp > SEEN_CACHE_TTL_MS) {
      seenEventsCache.delete(id);
    }
  }
}

// Check if event was already seen (idempotency)
function wasEventSeen(id: string): boolean {
  return seenEventsCache.has(id);
}

// Mark event as seen
function markEventSeen(id: string): void {
  seenEventsCache.set(id, Date.now());
}

// Transform raw event to Alert format (pure function)
function toAlert(event: Record<string, unknown>): Alert | null {
  // ... transform logic similar to AlertContext
}

// Severity filter (HIGH/CRITICAL only for realtime)
const REALTIME_SEVERITIES: EventSeverity[] = ['HIGH', 'CRITICAL'];

export interface RealtimeSubscription {
  unsubscribe: () => void;
  isConnected: () => boolean;
}

export interface RealtimeOptions {
  onEvent: (alert: Alert) => void;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: Error) => void;
}

export function subscribeObservabilityRealtime(
  options: RealtimeOptions
): RealtimeSubscription {
  let isConnected = false;
  
  const channel = supabase
    .channel('observability-realtime')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'audit_logs',
        // Filter critical events (server-side when supported)
      },
      (payload) => {
        const event = payload.new as Record<string, unknown>;
        const eventId = event.id as string;
        
        // Idempotency check
        if (wasEventSeen(eventId)) {
          return;
        }
        markEventSeen(eventId);
        
        // Transform and filter
        const alert = toAlert(event);
        if (alert && REALTIME_SEVERITIES.includes(alert.severity)) {
          options.onEvent(alert);
        }
      }
    )
    .subscribe((status) => {
      const connected = status === 'SUBSCRIBED';
      if (connected !== isConnected) {
        isConnected = connected;
        options.onConnectionChange?.(connected);
      }
    });
  
  // Cleanup cache periodically
  const cacheCleanupInterval = setInterval(cleanupSeenCache, 60000);
  
  return {
    unsubscribe: () => {
      clearInterval(cacheCleanupInterval);
      supabase.removeChannel(channel);
    },
    isConnected: () => isConnected,
  };
}
```

**Garantias:**
- ✅ Idempotência via cache de IDs (1h TTL)
- ✅ Cleanup garantido via `unsubscribe()`
- ✅ Fallback: se realtime falhar, polling continua
- ✅ Sem side-effects fora do callback

---

### P4.2.B — ALERTS.REALTIME (AlertContext Upgrade)

#### Tarefa B.1: Adicionar AlertProvider ao AppProviders

**Arquivo:** `src/contexts/AppProviders.tsx`

Adicionar import e wrapper:
```tsx
import { AlertProvider } from './AlertContext';

// Wrap children with AlertProvider (inside IdentityProvider)
<AlertProvider>
  {children}
</AlertProvider>
```

#### Tarefa B.2: Upgrade AlertContext Interface

**Arquivo:** `src/contexts/AlertContext.tsx`

Adicionar ao `AlertContextValue`:
```typescript
interface AlertContextValue {
  // Existing
  alerts: Alert[];
  activeCount: number;
  criticalCount: number;
  isLoading: boolean;
  dismissAlert: (id: string) => void;
  refreshAlerts: () => void;
  clearDismissed: () => void;
  
  // NEW: Realtime state
  isRealtimeConnected: boolean;
  lastRealtimeEventAt: string | null;
  newEventsCount: number;
  markNewEventsAsSeen: () => void;
}
```

#### Tarefa B.3: Implementar Realtime Subscription no AlertProvider

**Arquivo:** `src/contexts/AlertContext.tsx`

Adicionar useEffect para subscription:
```typescript
// Realtime subscription
useEffect(() => {
  const subscription = subscribeObservabilityRealtime({
    onEvent: (alert) => {
      // Add to alerts if not dismissed
      if (!dismissedIds.has(alert.id)) {
        setRealtimeAlerts(prev => {
          // Merge avoiding duplicates
          if (prev.some(a => a.id === alert.id)) return prev;
          return [alert, ...prev].slice(0, 50); // Cap at 50
        });
        setNewEventsCount(prev => prev + 1);
        setLastRealtimeEventAt(new Date().toISOString());
      }
    },
    onConnectionChange: (connected) => {
      setIsRealtimeConnected(connected);
    },
  });
  
  return () => subscription.unsubscribe();
}, [dismissedIds]);
```

#### Tarefa B.4: Merge Alerts (polling + realtime)

Função pura para merge:
```typescript
function mergeAlerts(
  pollingAlerts: Alert[],
  realtimeAlerts: Alert[],
  dismissedIds: Set<string>
): Alert[] {
  const merged = new Map<string, Alert>();
  
  // Add polling alerts first
  for (const alert of pollingAlerts) {
    merged.set(alert.id, { ...alert, dismissed: dismissedIds.has(alert.id) });
  }
  
  // Add realtime alerts (newer, may override)
  for (const alert of realtimeAlerts) {
    if (!merged.has(alert.id)) {
      merged.set(alert.id, { ...alert, dismissed: dismissedIds.has(alert.id) });
    }
  }
  
  // Sort by severity then timestamp
  return Array.from(merged.values())
    .sort((a, b) => {
      const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const diff = (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
      if (diff !== 0) return diff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
}
```

---

### P4.2.C — UX.REALTIME (Sutil e Profissional)

#### Tarefa C.1: Upgrade AlertBadge

**Arquivo:** `src/components/observability/AlertBadge.tsx`

Adicionar indicador de conexão:
```tsx
// Import Wifi, WifiOff from lucide-react

const { isRealtimeConnected, newEventsCount } = alertContext;

// Add small indicator next to badge
{isRealtimeConnected ? (
  <span className="absolute -bottom-1 -right-1 w-2 h-2 bg-success rounded-full" 
        title={t('observability.realtime.connected')} />
) : (
  <span className="absolute -bottom-1 -right-1 w-2 h-2 bg-muted-foreground rounded-full animate-pulse"
        title={t('observability.realtime.syncing')} />
)}
```

#### Tarefa C.2: Upgrade AlertsPanel

**Arquivo:** `src/components/observability/AlertsPanel.tsx`

Adicionar header "new events":
```tsx
const { newEventsCount, markNewEventsAsSeen, isRealtimeConnected } = useAlerts();

// In header, after SheetDescription:
{newEventsCount > 0 && (
  <div className="flex items-center justify-between bg-primary/10 rounded-lg px-3 py-2 mt-2">
    <span className="text-sm font-medium text-primary">
      {newEventsCount} {t('observability.realtime.newEvents')}
    </span>
    <Button variant="ghost" size="sm" onClick={markNewEventsAsSeen}>
      {t('observability.realtime.markSeen')}
    </Button>
  </div>
)}

// Connection status indicator in header
{isRealtimeConnected ? (
  <Badge variant="outline" className="text-success border-success">
    <Wifi className="h-3 w-3 mr-1" /> {t('observability.realtime.live')}
  </Badge>
) : (
  <Badge variant="outline" className="text-muted-foreground">
    <WifiOff className="h-3 w-3 mr-1" /> {t('observability.realtime.polling')}
  </Badge>
)}
```

#### Tarefa C.3: Integrar AlertsPanel no AdminHealthDashboard

**Arquivo:** `src/pages/AdminHealthDashboard.tsx`

Adicionar AlertsPanel no header:
```tsx
import { AlertsPanel, AlertBadge } from '@/components/observability';

// In header, after refresh button:
<AlertsPanel 
  trigger={<AlertBadge showZero className="ml-2" />}
/>
```

---

### P4.2.D — EXTERNAL HOOKS (OFF by default)

#### Tarefa D.1: Criar Edge Function Stub

**Arquivo:** `supabase/functions/notify-critical-alert/index.ts`

```typescript
/**
 * 🔔 notify-critical-alert — P4.2.D
 * 
 * Stub for external alert notifications.
 * OFF by default — requires explicit enablement.
 * 
 * Future integrations:
 * - Slack webhook
 * - Email notifications
 * - PagerDuty
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlertPayload {
  event_id: string;
  event_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  tenant_id?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate service role (internal only)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.includes('service_role')) {
      return new Response(
        JSON.stringify({ error: 'SERVICE_ROLE_REQUIRED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: AlertPayload = await req.json();

    // Validate payload
    if (!payload.event_id || !payload.event_type || !payload.severity) {
      return new Response(
        JSON.stringify({ error: 'INVALID_PAYLOAD' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STUB: Log to webhook_events for now (external integrations OFF)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    await supabase.from('webhook_events').insert({
      event_type: 'ALERT_NOTIFICATION_STUB',
      payload: payload,
      status: 'LOGGED',
    });

    // TODO: Future integrations
    // if (Deno.env.get('SLACK_WEBHOOK_URL')) { ... }
    // if (Deno.env.get('ALERT_EMAIL_ENABLED') === 'true') { ... }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        status: 'LOGGED',
        message: 'External notifications are OFF. Event logged for future integration.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[notify-critical-alert] Error:', error);
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

#### Tarefa D.2: Registrar no config.toml

**Arquivo:** `supabase/config.toml`

```toml
[functions.notify-critical-alert]
verify_jwt = false
```

#### Tarefa D.3: Atualizar Documentação

**Arquivo:** `docs/OBSERVABILITY.md`

Adicionar seção P4.2:
```markdown
## P4.2 — Realtime Infrastructure

### Supabase Realtime

The platform uses Supabase Realtime for instant alert delivery:

```typescript
// Client-side subscription
const subscription = subscribeObservabilityRealtime({
  onEvent: (alert) => { ... },
  onConnectionChange: (connected) => { ... },
});

// Cleanup
subscription.unsubscribe();
```

**Channel:** `observability-realtime`
**Table:** `audit_logs` (INSERT only)
**Filter:** HIGH/CRITICAL severity events

### Idempotency

Events are deduplicated using a client-side LRU cache:
- Cache key: event ID
- TTL: 1 hour
- Max size: ~1000 entries

### Connection States

| State | Badge | Fallback |
|-------|-------|----------|
| Connected | 🟢 Live | — |
| Disconnected | 🟡 Syncing | Polling (5 min) |
| Error | 🔴 Offline | Polling (5 min) |

### External Hooks (Future)

The `notify-critical-alert` edge function is prepared for:

**Payload Schema:**
```json
{
  "event_id": "uuid",
  "event_type": "TENANT_PAYMENT_FAILED",
  "severity": "CRITICAL",
  "tenant_id": "uuid",
  "metadata": {},
  "timestamp": "ISO-8601"
}
```

**Planned Integrations (OFF by default):**
- Slack Webhook
- Email (via Resend)
- PagerDuty
- Custom webhooks

**Enabling (Future):**
1. Set `SLACK_WEBHOOK_URL` secret
2. Trigger via database trigger or cron job
3. Monitor via `webhook_events` table
```

---

### P4.2.E — LOCALIZATION

#### Tarefa E.1: Adicionar Chaves i18n

**Arquivos:** `src/locales/pt-BR.ts`, `src/locales/en.ts`, `src/locales/es.ts`

```typescript
// P4.2 — Realtime
'observability.realtime.connected': 'Connected',
'observability.realtime.syncing': 'Syncing...',
'observability.realtime.live': 'Live',
'observability.realtime.polling': 'Polling',
'observability.realtime.newEvents': 'new event(s)',
'observability.realtime.markSeen': 'Mark as seen',
```

---

## Arquivos a Criar/Modificar

### Novos Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `src/lib/observability/realtime.ts` | Adapter realtime + idempotência |
| `supabase/functions/notify-critical-alert/index.ts` | Stub webhook OFF |

### Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/config.toml` | Adicionar notify-critical-alert |
| `src/contexts/AppProviders.tsx` | Adicionar AlertProvider |
| `src/contexts/AlertContext.tsx` | Realtime subscription + merge |
| `src/components/observability/AlertBadge.tsx` | Indicador "live" |
| `src/components/observability/AlertsPanel.tsx` | "New events" header |
| `src/pages/AdminHealthDashboard.tsx` | Integrar AlertsPanel |
| `src/lib/observability/index.ts` | Export realtime adapter |
| `docs/OBSERVABILITY.md` | Seção P4.2 |
| `src/locales/pt-BR.ts` | ~6 chaves |
| `src/locales/en.ts` | ~6 chaves |
| `src/locales/es.ts` | ~6 chaves |

### Migração SQL

| Migração | Descrição |
|----------|-----------|
| `YYYYMMDD_enable_realtime_audit_logs.sql` | Habilitar realtime para audit_logs |

---

## Critérios de Aceitação

### Realtime Core
- [ ] `audit_logs` adicionado a `supabase_realtime`
- [ ] `subscribeObservabilityRealtime()` funciona
- [ ] Idempotência previne duplicatas
- [ ] `unsubscribe()` limpa recursos

### AlertContext Upgrade
- [ ] `isRealtimeConnected` reflete estado
- [ ] `newEventsCount` incrementa para eventos novos
- [ ] `markNewEventsAsSeen()` zera contador
- [ ] Polling fallback permanece (5 min)
- [ ] Dismissed respeitado mesmo com realtime

### UX
- [ ] Badge mostra indicador "live" / "syncing"
- [ ] Panel mostra "X new events" quando aplicável
- [ ] "Mark as seen" funciona
- [ ] Zero toasts automáticos

### External Hooks
- [ ] Edge function existe e valida payload
- [ ] Nenhuma integração externa ativa
- [ ] Docs com payload canônico

### SAFE GOLD Invariants
- [ ] Nenhuma mutação de dados de negócio
- [ ] Polling fallback garante resiliência
- [ ] Cleanup garantido (no memory leaks)
- [ ] Sem navigate() em handlers realtime
- [ ] P3/P4.1 flows intocados

---

## Ordem de Execução

```text
1. Migração SQL (enable realtime for audit_logs)
    │
    ▼
2. P4.2.A — Realtime Adapter
    │ src/lib/observability/realtime.ts
    │
    ▼
3. P4.2.B — AlertContext Upgrade
    │ src/contexts/AlertContext.tsx
    │ src/contexts/AppProviders.tsx
    │
    ▼
4. P4.2.C — UX Polish
    │ AlertBadge.tsx
    │ AlertsPanel.tsx
    │ AdminHealthDashboard.tsx
    │
    ▼
5. P4.2.D — External Hooks
    │ notify-critical-alert/index.ts
    │ config.toml
    │ docs/OBSERVABILITY.md
    │
    ▼
6. P4.2.E — Localization
    │ pt-BR.ts, en.ts, es.ts
    │
    ▼
DONE
```

---

## Garantias de Segurança

Este PI **NÃO**:
- Altera fluxos de negócio (P3 intocado)
- Envia notificações externas automaticamente
- Depende de realtime para funcionar
- Cria side-effects fora do AlertContext
- Expõe dados sensíveis via realtime

Este PI **SIM**:
- Reduz latência de alertas de 5min para segundos
- Mantém polling como fallback robusto
- Prepara infraestrutura para integrações futuras
- Adiciona UX sutil e profissional

