

# P2.1 — EVENTOS CORE (GOVERNANÇA) — ANÁLISE SAFE MODE

## MODO DE EXECUÇÃO

- **SAFE MODE** — Zero Criatividade
- Zero Feature Fora do Escopo
- NÃO alterar contratos existentes
- NÃO alterar Auth, Stripe, Analytics
- NÃO criar automações
- NÃO refatorar código não relacionado
- Se algo não estiver explícito: NÃO IMPLEMENTAR

---

## ANÁLISE COMPLETA DO ESTADO ATUAL

### P2.1.1 — ESTADOS OFICIAIS DO EVENTO

| Requisito | Estado Atual | Status |
|-----------|--------------|--------|
| Enum `event_status` existe | Sim, no banco de dados | OK |
| Valores corretos no enum | **DIVERGÊNCIA IDENTIFICADA** | AJUSTE |

**Valores atuais no banco:**
```
{DRAFT, PUBLISHED, REGISTRATION_OPEN, REGISTRATION_CLOSED, ONGOING, FINISHED, ARCHIVED}
```

**Valores requisitados pelo P2.1:**
```
{DRAFT, PUBLISHED, REGISTRATION_OPEN, REGISTRATION_CLOSED, ONGOING, COMPLETED, CANCELLED}
```

**Divergências:**
- `FINISHED` vs `COMPLETED` — Renomeação não autorizada pelo SAFE MODE
- `ARCHIVED` existe mas não está na spec — Já implementado e funcional
- `CANCELLED` não existe — Nova adição

**RECOMENDAÇÃO**: A spec solicita não renomear estados existentes. O estado `FINISHED` já está em uso no código e banco. Adicionar `CANCELLED` é permitido, mas renomear `FINISHED` para `COMPLETED` violaria o SAFE MODE.

**AÇÃO PROPOSTA**: Manter `FINISHED` e `ARCHIVED` como estão (já funcionais), adicionar apenas `CANCELLED` como novo estado.

---

### P2.1.2 — TRANSIÇÕES PERMITIDAS

| Requisito | Estado Atual | Status |
|-----------|--------------|--------|
| Máquina de estados definida | Sim, em `src/types/event.ts` | OK |
| Transições validadas no frontend | Sim, `getValidTransitions()` | OK |
| Função `transitionEventStatus()` | **NÃO EXISTE** | CRIAR |

**Estado atual das transições** (linhas 89-97 de `event.ts`):
```typescript
export const EVENT_STATUS_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['REGISTRATION_OPEN', 'ARCHIVED'],
  REGISTRATION_OPEN: ['REGISTRATION_CLOSED'],
  REGISTRATION_CLOSED: ['ONGOING'],
  ONGOING: ['FINISHED'],
  FINISHED: ['ARCHIVED'],
  ARCHIVED: [], // Terminal state
};
```

**Transições requisitadas pelo P2.1:**
```
DRAFT → PUBLISHED
PUBLISHED → REGISTRATION_OPEN
REGISTRATION_OPEN → REGISTRATION_CLOSED
REGISTRATION_CLOSED → ONGOING
ONGOING → COMPLETED
QUALQUER (exceto COMPLETED) → CANCELLED
```

**Divergências:**
- Frontend permite `PUBLISHED → ARCHIVED` (não na spec)
- `CANCELLED` precisa ser adicionado como transição de qualquer estado
- Backend não valida transições (apenas frontend)

**GAPS IDENTIFICADOS:**
1. Adicionar estado `CANCELLED` ao enum
2. Adicionar transições para `CANCELLED`
3. Criar função backend de validação de transição

---

### P2.1.3 — VISIBILIDADE E COMPORTAMENTO POR ESTADO

| Estado | Requisito | Implementação Atual | Status |
|--------|-----------|---------------------|--------|
| DRAFT | Apenas Admin | RLS: `is_tenant_admin()` | OK |
| PUBLISHED | Público | RLS: `is_public = true` | OK |
| REGISTRATION_OPEN | Inscrição permitida | `canRegisterForEvent()` | OK |
| REGISTRATION_CLOSED | Inscrição bloqueada | `canRegisterForEvent()` | OK |
| ONGOING | Acompanhamento | Visualização permitida | OK |
| FINISHED | Read-only | Visualização permitida | OK |
| ARCHIVED | Público com filtro | RLS exclui de listagens | OK |
| CANCELLED | Evento marcado | **NÃO EXISTE** | CRIAR |

**RLS Policies existentes:**
```sql
-- Admin tem acesso total
events_admin_all: (is_tenant_admin(tenant_id) OR is_superadmin())

-- Público só vê eventos publicados, não-DRAFT, não-ARCHIVED
events_public_select: (is_public = true) AND (status NOT IN ('DRAFT', 'ARCHIVED'))
```

**GAP**: Quando `CANCELLED` for adicionado, a RLS precisa excluí-lo da listagem pública ou mostrá-lo com marcação.

---

### P2.1.4 — DELEÇÃO SEGURA DE EVENTO

| Requisito | Estado Atual | Status |
|-----------|--------------|--------|
| Soft delete com `deleted_at` | **COLUNA NÃO EXISTE** | CRIAR |
| Bloquear se houver inscrições | **NÃO IMPLEMENTADO** | CRIAR |
| Bloquear eventos ativos | **NÃO IMPLEMENTADO** | CRIAR |
| Nenhuma UI de deleção | **CORRETO** - Decisão intencional | OK |

**Evidência**: A coluna `deleted_at` não existe na tabela `events` (verificado via query).

**GAP**: Precisa adicionar coluna `deleted_at` e criar lógica de soft delete com validações.

---

### P2.1.5 — RESTRIÇÕES GERAIS

| Requisito | Estado Atual | Status |
|-----------|--------------|--------|
| Queries filtram por `tenant_id` | Sim, em todas as queries | OK |
| RLS valida tenant | Sim, `is_tenant_admin(tenant_id)` | OK |
| Triggers validam tenant | Sim, 3 triggers existentes | OK |
| Validação de estado em mutações | **PARCIAL** - Apenas frontend | AJUSTE |

**Triggers existentes** (verificados):
- `validate_event_category_tenant` — Valida tenant em categorias
- `validate_event_registration_tenant` — Valida tenant em inscrições
- `validate_event_result_tenant` — Valida tenant em resultados
- `prevent_event_results_modification` — Bloqueia UPDATE/DELETE em resultados

---

## RESUMO DE ALTERAÇÕES NECESSÁRIAS

### 1. Adicionar estado `CANCELLED` ao enum (DB)

```sql
ALTER TYPE event_status ADD VALUE 'CANCELLED';
```

### 2. Atualizar TypeScript types

**Arquivo**: `src/types/event.ts`

Adicionar `CANCELLED` ao tipo e configurações:
```typescript
export type EventStatus = 
  | 'DRAFT' 
  | 'PUBLISHED' 
  | 'REGISTRATION_OPEN' 
  | 'REGISTRATION_CLOSED' 
  | 'ONGOING' 
  | 'FINISHED' 
  | 'ARCHIVED'
  | 'CANCELLED';  // NOVO

// Adicionar config para CANCELLED
CANCELLED: { 
  label: 'Cancelado', 
  labelKey: 'events.status.cancelled',
  color: 'muted',
  descriptionKey: 'events.status.cancelledDesc',
},
```

### 3. Atualizar transições para incluir `CANCELLED`

```typescript
export const EVENT_STATUS_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['REGISTRATION_OPEN', 'CANCELLED'],
  REGISTRATION_OPEN: ['REGISTRATION_CLOSED', 'CANCELLED'],
  REGISTRATION_CLOSED: ['ONGOING', 'CANCELLED'],
  ONGOING: ['FINISHED', 'CANCELLED'],
  FINISHED: ['ARCHIVED'],  // Terminal - não pode cancelar
  ARCHIVED: [],            // Terminal
  CANCELLED: [],           // Terminal
};
```

### 4. Adicionar coluna `deleted_at` para soft delete

```sql
ALTER TABLE events ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Índice parcial para performance
CREATE INDEX idx_events_not_deleted ON events (tenant_id, status) WHERE deleted_at IS NULL;
```

### 5. Criar função de validação de transição (DB)

```sql
CREATE OR REPLACE FUNCTION validate_event_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Se status não mudou, permitir
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Validar transições permitidas
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('PUBLISHED', 'CANCELLED')) OR
    (OLD.status = 'PUBLISHED' AND NEW.status IN ('REGISTRATION_OPEN', 'CANCELLED')) OR
    (OLD.status = 'REGISTRATION_OPEN' AND NEW.status IN ('REGISTRATION_CLOSED', 'CANCELLED')) OR
    (OLD.status = 'REGISTRATION_CLOSED' AND NEW.status IN ('ONGOING', 'CANCELLED')) OR
    (OLD.status = 'ONGOING' AND NEW.status IN ('FINISHED', 'CANCELLED')) OR
    (OLD.status = 'FINISHED' AND NEW.status = 'ARCHIVED')
  ) THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_event_status_transition
  BEFORE UPDATE ON events
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION validate_event_status_transition();
```

### 6. Criar função de soft delete com validações (DB)

```sql
CREATE OR REPLACE FUNCTION soft_delete_event(p_event_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_status event_status;
  v_registration_count INT;
BEGIN
  -- Obter status atual
  SELECT status INTO v_status FROM events WHERE id = p_event_id;
  
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  
  -- Só pode deletar DRAFT ou CANCELLED
  IF v_status NOT IN ('DRAFT', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot delete event with status %. Only DRAFT or CANCELLED events can be deleted.', v_status;
  END IF;
  
  -- Verificar se há inscrições
  SELECT COUNT(*) INTO v_registration_count 
  FROM event_registrations 
  WHERE event_id = p_event_id AND status != 'CANCELED';
  
  IF v_registration_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete event with % active registrations', v_registration_count;
  END IF;
  
  -- Soft delete
  UPDATE events SET deleted_at = NOW() WHERE id = p_event_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 7. Atualizar RLS para excluir eventos deletados

```sql
-- Recriar policy para excluir deleted
DROP POLICY IF EXISTS events_public_select ON events;
CREATE POLICY events_public_select ON events
  FOR SELECT
  USING (
    is_public = true 
    AND status NOT IN ('DRAFT', 'ARCHIVED') 
    AND deleted_at IS NULL
  );
```

### 8. Adicionar i18n para `CANCELLED`

**pt-BR.ts, en.ts, es.ts**:
```typescript
'events.status.cancelled': 'Cancelado' / 'Cancelled' / 'Cancelado',
'events.status.cancelledDesc': 'Evento foi cancelado' / 'Event was cancelled' / 'Evento fue cancelado',
```

### 9. Atualizar helpers de comportamento

**Arquivo**: `src/types/event.ts`

```typescript
// Atualizar canCancelRegistration para incluir CANCELLED
export function canCancelRegistration(eventStatus: EventStatus): boolean {
  return eventStatus === 'REGISTRATION_OPEN' || eventStatus === 'REGISTRATION_CLOSED';
  // CANCELLED não permite mais cancelamentos de inscrição
}

// Nova função: verificar se evento pode ser deletado
export function canDeleteEvent(eventStatus: EventStatus): boolean {
  return eventStatus === 'DRAFT' || eventStatus === 'CANCELLED';
}
```

---

## ARQUIVOS A MODIFICAR

| Arquivo | Ação | Impacto |
|---------|------|---------|
| Migration SQL | CRIAR | Enum, coluna, triggers, função |
| `src/types/event.ts` | EDITAR | Tipo, config, transições, helpers |
| `src/locales/pt-BR.ts` | EDITAR | +2 chaves |
| `src/locales/en.ts` | EDITAR | +2 chaves |
| `src/locales/es.ts` | EDITAR | +2 chaves |

**Total**: ~100 linhas de alteração

---

## FORA DE ESCOPO (CONFIRMADO)

- Inscrição detalhada (existente e funcional)
- Pagamentos
- Cancelamento com refund
- Chaves / brackets
- Ranking
- Súmula
- Automação
- Analytics
- UI de deleção (por design)

---

## CRITÉRIOS DE ACEITE

| Critério | Esperado |
|----------|----------|
| Estado `CANCELLED` existe no enum | OK |
| Transições para `CANCELLED` funcionam | OK |
| Transições inválidas são bloqueadas no DB | OK |
| Soft delete funciona para DRAFT/CANCELLED | OK |
| Soft delete bloqueado se há inscrições | OK |
| RLS exclui eventos deletados | OK |
| i18n completo para CANCELLED | OK |
| Zero impacto em funcionalidades existentes | OK |

---

## RESULTADO ESPERADO

Após P2.1:
- Evento possui lifecycle claro e imutável
- Estados governam comportamento (validado no backend)
- Estado `CANCELLED` disponível para cancelamento de eventos
- Soft delete seguro com validações
- Nenhuma ação ocorre fora de regra
- Sistema pronto para FASE 2 (Inscrições) e FASE 3 (Pagamentos)

