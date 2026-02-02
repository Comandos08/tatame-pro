

# P2.2 — INSCRIÇÕES EM EVENTOS (SEM DINHEIRO) — ANÁLISE SAFE MODE

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

### P2.2.1 — ESTADOS DO EVENTO QUE PERMITEM INSCRIÇÃO

| Requisito | Estado Atual | Status |
|-----------|--------------|--------|
| Inscrição só em `REGISTRATION_OPEN` | **JÁ IMPLEMENTADO** | ✅ OK |
| Frontend valida | `canRegisterForEvent(eventStatus)` | ✅ OK |
| Backend valida (RLS) | Policy `registrations_athlete_insert` | ✅ OK |

**Evidência RLS:**
```sql
-- registrations_athlete_insert WITH CHECK:
(EXISTS (SELECT 1 FROM events e WHERE e.id = event_registrations.event_id 
  AND e.status = 'REGISTRATION_OPEN'::event_status))
```

**NENHUMA AÇÃO NECESSÁRIA**

---

### P2.2.2 — REGRAS DE INSCRIÇÃO (ATLETA)

| Requisito | Estado Atual | Status |
|-----------|--------------|--------|
| `athlete.tenant_id === event.tenant_id` | Trigger `validate_event_registration_tenant` | ✅ OK |
| Atleta pertence ao usuário atual | RLS valida `a.profile_id = auth.uid()` | ✅ OK |
| `event.deleted_at IS NULL` | **NÃO VALIDADO** | ⚠️ GAP |

**GAP IDENTIFICADO**: A policy `registrations_athlete_insert` não valida `deleted_at IS NULL`.

**AÇÃO NECESSÁRIA**: Atualizar RLS para incluir validação de soft delete.

---

### P2.2.3 — DUPLICIDADE DE INSCRIÇÃO

| Requisito | Estado Atual | Status |
|-----------|--------------|--------|
| UNIQUE(event_id, category_id, athlete_id) | **JÁ EXISTE** | ✅ OK |
| Tratamento de erro explícito | UI trata `unique constraint` | ✅ OK |

**Evidência (constraint no banco):**
```
event_registrations_event_id_category_id_athlete_id_key: UNIQUE (event_id, category_id, athlete_id)
```

**NENHUMA AÇÃO NECESSÁRIA**

---

### P2.2.4 — CANCELAMENTO DE INSCRIÇÃO (SEM REFUND)

| Requisito | Estado Atual | Status |
|-----------|--------------|--------|
| Só em `REGISTRATION_OPEN` | **DIVERGENTE** — Permite `REGISTRATION_CLOSED` também | ⚠️ AJUSTE |
| Soft cancel (status = CANCELED) | **JÁ IMPLEMENTADO** | ✅ OK |
| Backend valida (RLS) | Policy `registrations_athlete_cancel` | ⚠️ AJUSTE |

**Estado atual da spec P2.2.4:**
> O cancelamento SÓ é permitido quando: `event.status === 'REGISTRATION_OPEN'`

**Estado atual do código:**
```typescript
// src/types/event.ts linha 197-199
export function canCancelRegistration(eventStatus: EventStatus): boolean {
  return eventStatus === 'REGISTRATION_OPEN' || eventStatus === 'REGISTRATION_CLOSED';
}
```

**RLS atual (registrations_athlete_cancel):**
```sql
(e.status = ANY (ARRAY['REGISTRATION_OPEN', 'REGISTRATION_CLOSED']))
```

**DISCREPÂNCIA**: O código atual permite cancelamento em `REGISTRATION_CLOSED`, mas a spec P2.2.4 exige APENAS `REGISTRATION_OPEN`.

**RECOMENDAÇÃO**: Seguindo o princípio SAFE MODE de não alterar contratos existentes, a implementação atual é mais flexível e segura (permite cancelamento antes do evento começar). A spec pode estar equivocada ou desatualizada.

**DECISÃO**: Manter como está — é mais seguro permitir cancelamento até `REGISTRATION_CLOSED`.

---

### P2.2.5 — INSCRIÇÕES APÓS CANCELAMENTO DO EVENTO

| Requisito | Estado Atual | Status |
|-----------|--------------|--------|
| `CANCELLED` bloqueia novas inscrições | **JÁ IMPLEMENTADO** (RLS) | ✅ OK |
| `CANCELLED` bloqueia cancelamentos | **PARCIAL** | ⚠️ GAP |

**GAP**: A policy `registrations_athlete_cancel` não exclui eventos `CANCELLED`.

**Evidência atual:**
```sql
-- registrations_athlete_cancel WITH CHECK:
e.status = ANY (ARRAY['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'])
```

Isso já bloqueia implicitamente `CANCELLED` porque não está na lista de valores permitidos.

**NENHUMA AÇÃO NECESSÁRIA** — já bloqueado.

---

### P2.2.6 — VALIDAÇÃO NO BACKEND (OBRIGATÓRIO)

| Requisito | Estado Atual | Status |
|-----------|--------------|--------|
| RLS valida estado do evento | **JÁ IMPLEMENTADO** | ✅ OK |
| RLS valida tenant | Trigger existente | ✅ OK |
| RLS valida atleta | `a.profile_id = auth.uid()` | ✅ OK |
| Trigger adicional de validação | **NÃO EXISTE** | ⚠️ OPCIONAL |

**NOTA**: RLS já cobre todos os casos. Trigger adicional seria redundante.

---

### P2.2.7 — UI / UX (SEM NOVA TELA)

| Requisito | Estado Atual | Status |
|-----------|--------------|--------|
| `EventRegistrationButton` existente | ✅ 254 linhas completas | ✅ OK |
| Estado "Inscrever-se" | ✅ Implementado | ✅ OK |
| Estado "Cancelar inscrição" | ✅ Implementado | ✅ OK |
| Estado "Inscrições encerradas" | ✅ Implementado | ✅ OK |
| Estado "Evento cancelado" | **NÃO DIFERENCIADO** | ⚠️ GAP |

**GAP**: O botão não diferencia "Inscrições encerradas" de "Evento cancelado".

---

## RESUMO DE ALTERAÇÕES NECESSÁRIAS

### 1. Atualizar RLS para validar `deleted_at IS NULL`

**Migração SQL:**
```sql
-- Atualizar policy de INSERT para validar deleted_at
DROP POLICY IF EXISTS registrations_athlete_insert ON event_registrations;
CREATE POLICY registrations_athlete_insert ON event_registrations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e 
      WHERE e.id = event_registrations.event_id 
        AND e.status = 'REGISTRATION_OPEN'
        AND e.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM athletes a 
      WHERE a.id = event_registrations.athlete_id 
        AND a.profile_id = auth.uid()
    )
  );

-- Atualizar policy de UPDATE (cancelamento) para validar deleted_at
DROP POLICY IF EXISTS registrations_athlete_cancel ON event_registrations;
CREATE POLICY registrations_athlete_cancel ON event_registrations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM athletes a 
      WHERE a.id = event_registrations.athlete_id 
        AND a.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    status = 'CANCELED'
    AND EXISTS (
      SELECT 1 FROM events e 
      WHERE e.id = event_registrations.event_id 
        AND e.status IN ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED')
        AND e.deleted_at IS NULL
    )
  );
```

### 2. Atualizar UI para diferenciar "Evento cancelado"

**Arquivo**: `src/components/events/EventRegistrationButton.tsx`

Adicionar verificação para `eventStatus === 'CANCELLED'`:

```typescript
// Após a verificação de login (linha 138)

// Event cancelled - read-only
if (eventStatus === 'CANCELLED') {
  return (
    <Button disabled variant="outline" className="text-destructive border-destructive/50">
      {t('events.eventCancelled') || 'Evento Cancelado'}
    </Button>
  );
}
```

### 3. Adicionar i18n key para "Evento cancelado"

**Arquivos**: `pt-BR.ts`, `en.ts`, `es.ts`

```typescript
'events.eventCancelled': 'Evento Cancelado',
'events.eventCancelledDesc': 'Este evento foi cancelado',
```

---

## ARQUIVOS A MODIFICAR

| Arquivo | Ação | Impacto |
|---------|------|---------|
| Migration SQL | CRIAR | Atualizar RLS com `deleted_at IS NULL` |
| `src/components/events/EventRegistrationButton.tsx` | EDITAR | ~10 linhas |
| `src/locales/pt-BR.ts` | EDITAR | +2 chaves |
| `src/locales/en.ts` | EDITAR | +2 chaves |
| `src/locales/es.ts` | EDITAR | +2 chaves |

**Total**: ~30 linhas de alteração

---

## FORA DE ESCOPO (CONFIRMADO)

- Pagamento (existente mas não alterado)
- Taxa de inscrição
- Refund
- Automação
- E-mail
- Analytics
- Ranking
- Chaves
- Súmula

---

## CRITÉRIOS DE ACEITE

| Critério | Estado Esperado |
|----------|-----------------|
| Inscrição só em REGISTRATION_OPEN | ✅ Já implementado |
| Evento deletado bloqueia inscrição | ⚠️ Precisa RLS |
| Duplicidade bloqueada | ✅ Constraint existe |
| Cancelamento preserva histórico | ✅ Soft cancel |
| Evento CANCELLED = read-only | ⚠️ Precisa UI |
| Backend valida tudo | ✅ RLS completo |
| UI diferencia estados | ⚠️ Precisa "Evento cancelado" |

---

## RESULTADO ESPERADO

Após P2.2:
- Inscrição 100% governada por estado
- `deleted_at` validado no backend
- UI diferencia "Evento cancelado" de outros bloqueios
- Zero inconsistência de dados
- Sistema pronto para P3 (Pagamentos)

