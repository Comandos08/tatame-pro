
# P4.1 — OBSERVABILITY.CORE (MASTER PLAN)

## Diagnóstico do Codebase Atual

### Infraestrutura Existente

| Componente | Estado | Observação |
|------------|--------|------------|
| **audit_logs** | ✅ Completo | 40+ event types, Edge Functions integradas |
| **decision_logs** | ✅ Completo | Hash chain SHA-256, tamper detection |
| **security_events** | ✅ Completo | Rate limit, cross-tenant, auth failures |
| **security_timeline** (view) | ✅ Completo | Unifica decision_logs + security_events |
| **webhook_events** | ✅ Completo | Stripe webhook tracking |
| **PlatformHealthCard** | ✅ Funcional | Job status + billing metrics (Superadmin) |
| **SystemHealthCard** | ⚠️ Limitado | Apenas tenant-scoped, métricas básicas |
| **SecurityTimeline** | ✅ Funcional | UI para security_timeline view |
| **TenantDiagnostics** | ✅ Funcional | Read-only tenant diagnostics |
| **AdminDiagnostics** | ✅ Funcional | Platform-wide diagnostics |
| **formatSecurityEvent** | ✅ Completo | Human-readable security events |
| **formatAuditEvent** | ✅ Completo | Human-readable audit events |
| **logger.ts** | ✅ Básico | Environment-aware logging |
| **error-report.ts** | ✅ Básico | Error buffer + future Sentry hook |

### Gaps Identificados

| Gap | Impacto | Prioridade |
|-----|---------|------------|
| Sem padronização de `category` em audit_logs | Queries lentas | P4.1.A |
| Sem view materializada para jobs | Performance | P4.1.B |
| Sem health status consolidado (OK/DEGRADED/CRITICAL) | UX admin | P4.1.B |
| Dashboard disperso (cards separados) | Contexto fragmentado | P4.1.C |
| Sem flags de alerta persistentes | Alertas manuais | P4.1.D |
| Sem hook reutilizável para health status | Duplicação | P4.1.B |

---

## Arquitetura P4.1

```text
┌──────────────────────────────────────────────────────────────────┐
│                      EDGE FUNCTIONS                               │
│  (audit-logger.ts, decision-logger.ts, security-logger.ts)       │
└────────────────────────────┬─────────────────────────────────────┘
                             │ INSERT
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                    DATA LAYER (Existing)                          │
│  audit_logs | decision_logs | security_events | webhook_events   │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              P4.1.A — OBSERVABILITY VIEWS                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │ observability_  │  │ job_execution_  │  │ event_category_ │   │
│  │ unified_events  │  │ summary         │  │ index           │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              P4.1.B — HEALTH STATUS ENGINE                        │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ useSystemHealthStatus() hook                                 │ │
│  │ → OK | DEGRADED | CRITICAL                                   │ │
│  │ → reasons[], recommendations[]                               │ │
│  └─────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              P4.1.C — ADMIN HEALTH DASHBOARD                      │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐     │
│  │ JobsCard  │  │ Billing   │  │ Membership│  │ Alerts    │     │
│  │           │  │ Card      │  │ Card      │  │ Card      │     │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘     │
│  READ-ONLY • ZERO MUTATIONS • AUTO-REFRESH                       │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              P4.1.D — ALERT FLAGS (FUTURE-READY)                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ AlertContext → badges, banners, indicators                  │ │
│  │ Prepared for: Realtime | Webhooks | Slack                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## P4.1.A — OBSERVABILITY.DATA.MODEL

### Objetivo
Normalizar, categorizar e indexar dados para queries rápidas.

### Tarefas

#### Tarefa A.1: Adicionar `category` ao audit_logs

**Migração SQL:**
```sql
-- Add category column for efficient filtering
ALTER TABLE audit_logs 
ADD COLUMN IF NOT EXISTS category TEXT;

-- Create index for category
CREATE INDEX IF NOT EXISTS idx_audit_logs_category 
ON audit_logs(category) WHERE category IS NOT NULL;

-- Backfill categories based on event_type patterns
UPDATE audit_logs SET category = 
  CASE 
    WHEN event_type LIKE 'MEMBERSHIP_%' THEN 'MEMBERSHIP'
    WHEN event_type LIKE 'TENANT_%' OR event_type LIKE 'BILLING_%' THEN 'BILLING'
    WHEN event_type LIKE 'JOB_%' THEN 'JOB'
    WHEN event_type LIKE 'DIPLOMA_%' OR event_type LIKE 'GRADING_%' THEN 'GRADING'
    WHEN event_type LIKE 'IMPERSONATION_%' THEN 'SECURITY'
    WHEN event_type LIKE 'LOGIN_%' OR event_type LIKE 'PASSWORD_%' THEN 'AUTH'
    WHEN event_type LIKE 'ROLES_%' THEN 'ROLES'
    ELSE 'OTHER'
  END
WHERE category IS NULL;

-- Create trigger to auto-set category on INSERT
CREATE OR REPLACE FUNCTION set_audit_log_category()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.category IS NULL THEN
    NEW.category := CASE 
      WHEN NEW.event_type LIKE 'MEMBERSHIP_%' THEN 'MEMBERSHIP'
      WHEN NEW.event_type LIKE 'TENANT_%' OR NEW.event_type LIKE 'BILLING_%' THEN 'BILLING'
      WHEN NEW.event_type LIKE 'JOB_%' THEN 'JOB'
      WHEN NEW.event_type LIKE 'DIPLOMA_%' OR NEW.event_type LIKE 'GRADING_%' THEN 'GRADING'
      WHEN NEW.event_type LIKE 'IMPERSONATION_%' THEN 'SECURITY'
      WHEN NEW.event_type LIKE 'LOGIN_%' OR NEW.event_type LIKE 'PASSWORD_%' THEN 'AUTH'
      WHEN NEW.event_type LIKE 'ROLES_%' THEN 'ROLES'
      ELSE 'OTHER'
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_category
BEFORE INSERT ON audit_logs
FOR EACH ROW EXECUTE FUNCTION set_audit_log_category();
```

#### Tarefa A.2: Criar View `job_execution_summary`

**Migração SQL:**
```sql
CREATE OR REPLACE VIEW job_execution_summary AS
SELECT 
  event_type,
  -- Last successful run
  MAX(CASE WHEN (metadata->>'status') = 'COMPLETED' THEN created_at END) AS last_success_at,
  -- Last failure
  MAX(CASE WHEN (metadata->>'status') = 'FAILED' THEN created_at END) AS last_failure_at,
  -- Counts in last 24h
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS runs_24h,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' 
                    AND (metadata->>'status') = 'COMPLETED') AS success_24h,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' 
                    AND (metadata->>'status') = 'FAILED') AS failures_24h,
  -- Items processed in last 24h
  COALESCE(SUM((metadata->>'processed')::int) 
    FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0) AS items_processed_24h,
  -- Counts in last 7d
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS runs_7d,
  COALESCE(SUM((metadata->>'processed')::int) 
    FILTER (WHERE created_at > NOW() - INTERVAL '7 days'), 0) AS items_processed_7d
FROM audit_logs
WHERE event_type LIKE 'JOB_%_RUN'
GROUP BY event_type;

COMMENT ON VIEW job_execution_summary IS 'Aggregated job execution metrics for observability';
```

#### Tarefa A.3: Criar View `observability_critical_events`

**Migração SQL:**
```sql
CREATE OR REPLACE VIEW observability_critical_events AS
SELECT 
  id,
  'AUDIT' AS source,
  event_type,
  category,
  tenant_id,
  created_at,
  metadata,
  CASE 
    WHEN event_type IN ('TENANT_PAYMENT_FAILED', 'MEMBERSHIP_PAYMENT_RETRY_FAILED') THEN 'HIGH'
    WHEN event_type LIKE '%_FAILED' OR event_type LIKE '%_ERROR' THEN 'MEDIUM'
    ELSE 'LOW'
  END AS severity
FROM audit_logs
WHERE 
  event_type LIKE '%_FAILED' 
  OR event_type LIKE '%_ERROR'
  OR event_type IN ('TENANT_PAYMENT_FAILED', 'MEMBERSHIP_PAYMENT_RETRY_FAILED')
  AND created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
  id,
  'DECISION' AS source,
  decision_type AS event_type,
  'SECURITY' AS category,
  tenant_id,
  created_at,
  metadata,
  severity::text
FROM decision_logs
WHERE 
  severity IN ('HIGH', 'CRITICAL')
  AND created_at > NOW() - INTERVAL '7 days'

ORDER BY created_at DESC
LIMIT 100;

COMMENT ON VIEW observability_critical_events IS 'Critical events requiring attention from the last 7 days';
```

#### Tarefa A.4: Atualizar audit-logger.ts com Category

**Arquivo:** `supabase/functions/_shared/audit-logger.ts`

Adicionar campo `category` ao `AuditMetadata` e auto-detect no `createAuditLog`:

```typescript
// Add to AuditMetadata interface
category?: 'MEMBERSHIP' | 'BILLING' | 'JOB' | 'GRADING' | 'SECURITY' | 'AUTH' | 'ROLES' | 'OTHER';

// Add category detection helper
function detectCategory(eventType: string): string {
  if (eventType.startsWith('MEMBERSHIP_')) return 'MEMBERSHIP';
  if (eventType.startsWith('TENANT_') || eventType.startsWith('BILLING_')) return 'BILLING';
  if (eventType.startsWith('JOB_')) return 'JOB';
  if (eventType.startsWith('DIPLOMA_') || eventType.startsWith('GRADING_')) return 'GRADING';
  if (eventType.startsWith('IMPERSONATION_')) return 'SECURITY';
  if (eventType.startsWith('LOGIN_') || eventType.startsWith('PASSWORD_')) return 'AUTH';
  if (eventType.startsWith('ROLES_')) return 'ROLES';
  return 'OTHER';
}
```

---

## P4.1.B — JOBS & SYSTEM HEALTH

### Objetivo
Classificar saúde do sistema em estados explícitos: OK | DEGRADED | CRITICAL

### Tarefas

#### Tarefa B.1: Criar Hook `useSystemHealthStatus`

**Arquivo:** `src/hooks/useSystemHealthStatus.ts`

```typescript
export type HealthStatus = 'OK' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  lastCheck: string | null;
  reason?: string;
  recommendation?: string;
}

export interface SystemHealth {
  overall: HealthStatus;
  checks: HealthCheck[];
  summary: {
    ok: number;
    degraded: number;
    critical: number;
  };
  updatedAt: string;
}
```

**Lógica de Classificação:**
- **CRITICAL**: Job não executou em 48h+ ou 3+ billing failures em 24h
- **DEGRADED**: Job atrasado 24-48h ou billing issues presentes
- **OK**: Todos os jobs executando, sem billing issues críticos

#### Tarefa B.2: Criar Componente `HealthStatusIndicator`

**Arquivo:** `src/components/observability/HealthStatusIndicator.tsx`

Componente visual simples:
- 🟢 OK - "Sistemas operacionais"
- 🟡 DEGRADED - "Atenção necessária"
- 🔴 CRITICAL - "Ação imediata requerida"

#### Tarefa B.3: Criar Componente `JobsHealthCard`

**Arquivo:** `src/components/observability/JobsHealthCard.tsx`

Refatorar lógica do PlatformHealthCard em componente dedicado:
- Status de cada job (last_run, success/failure)
- Indicador visual por job
- Tooltips explicativos
- Auto-refresh (5 min)

#### Tarefa B.4: Criar Tipos Canônicos

**Arquivo:** `src/types/observability.ts`

```typescript
export type EventCategory = 
  | 'MEMBERSHIP' 
  | 'BILLING' 
  | 'JOB' 
  | 'GRADING' 
  | 'SECURITY' 
  | 'AUTH' 
  | 'ROLES' 
  | 'OTHER';

export type EventSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ObservabilityEvent {
  id: string;
  source: 'AUDIT' | 'DECISION' | 'SECURITY';
  event_type: string;
  category: EventCategory;
  severity: EventSeverity;
  tenant_id: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface JobStatus {
  job_name: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  status: 'OK' | 'DELAYED' | 'FAILED' | 'NEVER_RAN';
  runs_24h: number;
  items_processed_24h: number;
}
```

---

## P4.1.C — ADMIN HEALTH DASHBOARD

### Objetivo
UI consolidada, read-only, para admin entender estado do sistema em 30 segundos.

### Tarefas

#### Tarefa C.1: Criar Página `AdminHealthDashboard`

**Arquivo:** `src/pages/AdminHealthDashboard.tsx`

Layout:
```
┌────────────────────────────────────────────────────────────────┐
│  🟢 System Status: OPERATIONAL              [Refresh] [30s ago]│
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Jobs Health  │  │   Billing    │  │ Memberships  │         │
│  │  5/5 OK      │  │ 12 Active    │  │ 45 Active    │         │
│  │  [Details]   │  │ 2 Issues     │  │ 3 Pending    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
├────────────────────────────────────────────────────────────────┤
│  Recent Critical Events (last 24h)                             │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 🔴 TENANT_PAYMENT_FAILED - tenant_xyz - 2h ago           │ │
│  │ 🟡 JOB delayed: cleanup_abandoned - 26h ago              │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

#### Tarefa C.2: Adicionar Cards Individuais

**Arquivos:**
- `src/components/observability/BillingHealthCard.tsx`
- `src/components/observability/MembershipHealthCard.tsx`
- `src/components/observability/CriticalEventsCard.tsx`

Cada card:
- Métricas key (count, status)
- Indicador visual (badge/color)
- Link para detalhes
- Zero ações destrutivas

#### Tarefa C.3: Adicionar Rota no AppRouter

**Arquivo:** `src/routes/AppRouter.tsx`

```tsx
// Superadmin only route
<Route path="/admin/health" element={<AdminHealthDashboard />} />
```

#### Tarefa C.4: Adicionar Link no AdminDashboard

**Arquivo:** `src/pages/AdminDashboard.tsx`

Adicionar card de navegação para `/admin/health`:
```tsx
<Card onClick={() => navigate('/admin/health')} className="cursor-pointer">
  <CardHeader>
    <Activity className="h-5 w-5" />
    <CardTitle>System Health</CardTitle>
    <CardDescription>Real-time platform monitoring</CardDescription>
  </CardHeader>
</Card>
```

---

## P4.1.D — ALERTS (MANUAL → FUTURE REALTIME)

### Objetivo
Preparar infraestrutura de alertas sem implementar notificações automáticas.

### Tarefas

#### Tarefa D.1: Criar `AlertContext`

**Arquivo:** `src/contexts/AlertContext.tsx`

```typescript
export interface Alert {
  id: string;
  type: 'JOB_FAILURE' | 'BILLING_ISSUE' | 'SECURITY_BREACH' | 'MEMBERSHIP_SPIKE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  timestamp: string;
  dismissed: boolean;
  tenant_id?: string;
}

export interface AlertContextValue {
  alerts: Alert[];
  activeCount: number;
  criticalCount: number;
  dismissAlert: (id: string) => void;
  refreshAlerts: () => void;
}
```

#### Tarefa D.2: Criar Hook `useAlerts`

**Arquivo:** `src/hooks/useAlerts.ts`

Hook que:
- Faz query em `observability_critical_events`
- Transforma em estrutura `Alert`
- Armazena dismissed state em localStorage
- Auto-refresh (5 min)

#### Tarefa D.3: Criar Componente `AlertBadge`

**Arquivo:** `src/components/observability/AlertBadge.tsx`

Badge para header/sidebar mostrando count de alertas ativos.

#### Tarefa D.4: Criar Componente `AlertsPanel`

**Arquivo:** `src/components/observability/AlertsPanel.tsx`

Panel slide-out/modal listando alertas:
- Ordenados por severidade → timestamp
- Botão dismiss (não apaga, marca como dismissed)
- Link para details

#### Tarefa D.5: Documentar Hook Points para Realtime

**Arquivo:** `docs/OBSERVABILITY.md`

```markdown
## Future Realtime Integration

### Supabase Realtime
- Subscribe to `audit_logs` INSERT WHERE category = 'CRITICAL'
- Trigger AlertContext.refreshAlerts()

### Webhook Integration
- Endpoint: POST /api/alerts/webhook
- Payload: { type, severity, details }

### Slack/Email (Future)
- Edge Function: notify-critical-alert
- Triggered by: audit_log with severity = CRITICAL
```

---

## Arquivos a Criar/Modificar

### Novos Arquivos

| Arquivo | PI | Descrição |
|---------|-----|-----------|
| `supabase/migrations/YYYYMMDD_observability_data_model.sql` | A | Views e indexes |
| `src/hooks/useSystemHealthStatus.ts` | B | Health status hook |
| `src/types/observability.ts` | B | Tipos canônicos |
| `src/components/observability/HealthStatusIndicator.tsx` | B | Status visual |
| `src/components/observability/JobsHealthCard.tsx` | B | Jobs card refatorado |
| `src/components/observability/BillingHealthCard.tsx` | C | Billing metrics |
| `src/components/observability/MembershipHealthCard.tsx` | C | Membership metrics |
| `src/components/observability/CriticalEventsCard.tsx` | C | Critical events list |
| `src/components/observability/index.ts` | C | Barrel export |
| `src/pages/AdminHealthDashboard.tsx` | C | Dashboard consolidado |
| `src/contexts/AlertContext.tsx` | D | Alert state management |
| `src/hooks/useAlerts.ts` | D | Alert hook |
| `src/components/observability/AlertBadge.tsx` | D | Alert counter badge |
| `src/components/observability/AlertsPanel.tsx` | D | Alert list panel |
| `docs/OBSERVABILITY.md` | D | Documentação técnica |

### Arquivos a Modificar

| Arquivo | PI | Mudança |
|---------|-----|---------|
| `supabase/functions/_shared/audit-logger.ts` | A | Adicionar category |
| `src/pages/AdminDashboard.tsx` | C | Link para health dashboard |
| `src/routes/AppRouter.tsx` | C | Nova rota /admin/health |
| `src/locales/pt-BR.ts` | B,C,D | ~30 novas chaves |
| `src/locales/en.ts` | B,C,D | ~30 novas chaves |
| `src/locales/es.ts` | B,C,D | ~30 novas chaves |

---

## Critérios de Aceitação

### P4.1.A — Data Model
- [ ] Column `category` existe em audit_logs
- [ ] Trigger auto-popula category
- [ ] View `job_execution_summary` criada
- [ ] View `observability_critical_events` criada
- [ ] Backfill executado sem erros

### P4.1.B — Health Status
- [ ] Hook `useSystemHealthStatus` retorna OK/DEGRADED/CRITICAL
- [ ] Classificação baseada em regras determinísticas
- [ ] Tipos canônicos exportados
- [ ] `JobsHealthCard` funcional

### P4.1.C — Dashboard
- [ ] Página `/admin/health` acessível
- [ ] 4 cards visíveis: Jobs, Billing, Memberships, Events
- [ ] Zero mutations (read-only)
- [ ] Auto-refresh funcionando
- [ ] Link no AdminDashboard

### P4.1.D — Alerts
- [ ] `AlertContext` provê alertas
- [ ] `AlertBadge` mostra count
- [ ] Dismiss persiste em localStorage
- [ ] Documentação de hook points criada

### Invariantes SAFE GOLD
- [ ] Nenhuma mutação de dados de negócio
- [ ] Nenhum efeito colateral em fluxos existentes
- [ ] RLS aplicado em todas as views
- [ ] Performance: queries < 500ms

---

## Ordem de Execução

```text
P4.1.A (Data Model)
    │
    ├── Migração SQL (views, indexes)
    ├── Backfill categories
    └── Update audit-logger.ts
         │
         ▼
P4.1.B (Health Status)
    │
    ├── Types (observability.ts)
    ├── Hook (useSystemHealthStatus)
    └── Components (HealthStatusIndicator, JobsHealthCard)
         │
         ▼
P4.1.C (Dashboard)
    │
    ├── Page (AdminHealthDashboard)
    ├── Cards (Billing, Membership, Events)
    ├── Route (/admin/health)
    └── Link no AdminDashboard
         │
         ▼
P4.1.D (Alerts)
    │
    ├── Context (AlertContext)
    ├── Hook (useAlerts)
    ├── Components (AlertBadge, AlertsPanel)
    └── Documentation (OBSERVABILITY.md)
```

---

## Garantias de Segurança

Este PI **NÃO**:
- Altera fluxos de negócio (P3 intocado)
- Cria dependências circulares
- Modifica estado de memberships/billing
- Expõe PII (apenas aggregates e event types)
- Bloqueia operações existentes

Este PI **APENAS**:
- Lê dados existentes
- Cria views read-only
- Adiciona UI de observação
- Prepara infraestrutura para alertas futuros
