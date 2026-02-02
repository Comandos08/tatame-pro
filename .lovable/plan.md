

# P2.5 — RESULTADOS DE LUTAS (SAFE MODE · GOVERNANÇA TOTAL)

## ANÁLISE DO ESTADO ATUAL

### ✅ Já Implementado
| Componente | Status |
|------------|--------|
| Coluna `winner_registration_id` em `event_bracket_matches` | ✅ Já existe |
| Status `COMPLETED` no match | ✅ Já existe |
| Trigger de imutabilidade para bracket PUBLISHED | ✅ |
| Edge Functions padrão (generate, publish) | ✅ |
| UI de visualização de matches | ✅ |

### ❌ Gaps a Implementar
| Gap | Descrição |
|-----|-----------|
| Colunas `completed_at` e `recorded_by` | Auditoria de quem/quando |
| RPC `record_match_result_rpc` | Transação atômica: resultado + avanço |
| Trigger `enforce_match_result_rules` | Bloquear resultado em não-PUBLISHED / regravação |
| Edge Function `record-match-result` | Orquestrador seguro |
| UI de registro de resultado | Modal em BracketMatchCard |

---

## FASE 1 — BANCO DE DADOS (EXTENSÃO CONTROLADA)

### 1.1 Novas Colunas em `event_bracket_matches`

```sql
-- Adicionar colunas de auditoria
ALTER TABLE event_bracket_matches
ADD COLUMN IF NOT EXISTS completed_at timestamptz,
ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES profiles(id);
```

### 1.2 Constraint de Integridade

```sql
-- Garantir que o vencedor é um dos participantes
ALTER TABLE event_bracket_matches
ADD CONSTRAINT winner_must_be_participant
CHECK (
  winner_registration_id IS NULL
  OR winner_registration_id = athlete1_registration_id
  OR winner_registration_id = athlete2_registration_id
);
```

### 1.3 Trigger de Governança (CRÍTICO)

```sql
CREATE OR REPLACE FUNCTION enforce_match_result_rules()
RETURNS TRIGGER AS $$
DECLARE
  v_bracket_status text;
BEGIN
  -- 1. Buscar status do bracket
  SELECT status INTO v_bracket_status
  FROM event_brackets
  WHERE id = NEW.bracket_id;

  -- 2. Só permite resultado se bracket for PUBLISHED
  IF v_bracket_status IS DISTINCT FROM 'PUBLISHED' THEN
    RAISE EXCEPTION 'Cannot record result on non-published bracket';
  END IF;

  -- 3. Bloquear regravação de resultado (imutável após COMPLETED)
  IF OLD.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Match result is immutable once completed';
  END IF;

  -- 4. Validar que o vencedor é um participante
  IF NEW.winner_registration_id IS NOT NULL 
     AND NEW.winner_registration_id NOT IN (NEW.athlete1_registration_id, NEW.athlete2_registration_id) THEN
    RAISE EXCEPTION 'Winner must be one of the match participants';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Trigger para transição para COMPLETED
CREATE TRIGGER enforce_match_result
BEFORE UPDATE ON event_bracket_matches
FOR EACH ROW
WHEN (OLD.status = 'SCHEDULED' AND NEW.status = 'COMPLETED')
EXECUTE FUNCTION enforce_match_result_rules();
```

**Garantias:**
- Só registra resultado em bracket PUBLISHED
- Match COMPLETED é imutável
- Vencedor deve ser participante do match

---

## FASE 2 — RPC TRANSACIONAL: `record_match_result_rpc`

```sql
CREATE OR REPLACE FUNCTION record_match_result_rpc(
  p_match_id uuid,
  p_winner_registration_id uuid,
  p_recorded_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match record;
  v_bracket record;
  v_next_match record;
  v_source_key text;
BEGIN
  -- 1️⃣ Buscar match com lock
  SELECT * INTO v_match
  FROM event_bracket_matches
  WHERE id = p_match_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  -- 2️⃣ Validar status do match
  IF v_match.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Match result is already recorded';
  END IF;

  IF v_match.status = 'BYE' THEN
    RAISE EXCEPTION 'Cannot record result for BYE match';
  END IF;

  -- 3️⃣ Validar que ambos os atletas estão definidos
  IF v_match.athlete1_registration_id IS NULL OR v_match.athlete2_registration_id IS NULL THEN
    RAISE EXCEPTION 'Both athletes must be defined to record result';
  END IF;

  -- 4️⃣ Validar que o vencedor é participante
  IF p_winner_registration_id NOT IN (v_match.athlete1_registration_id, v_match.athlete2_registration_id) THEN
    RAISE EXCEPTION 'Winner must be one of the match participants';
  END IF;

  -- 5️⃣ Buscar bracket e validar status
  SELECT * INTO v_bracket
  FROM event_brackets
  WHERE id = v_match.bracket_id;

  IF v_bracket.status != 'PUBLISHED' THEN
    RAISE EXCEPTION 'Can only record results on published brackets';
  END IF;

  -- 6️⃣ Atualizar match atual
  UPDATE event_bracket_matches
  SET
    winner_registration_id = p_winner_registration_id,
    status = 'COMPLETED',
    completed_at = now(),
    recorded_by = p_recorded_by,
    updated_at = now()
  WHERE id = p_match_id;

  -- 7️⃣ Avançar vencedor para o próximo round
  v_source_key := format('R%sM%s', v_match.round, v_match.position);

  SELECT * INTO v_next_match
  FROM event_bracket_matches
  WHERE bracket_id = v_match.bracket_id
    AND round = v_match.round + 1
    AND meta->'source'->'from' ? v_source_key
    AND deleted_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    -- Determinar qual slot preencher
    IF v_next_match.athlete1_registration_id IS NULL THEN
      UPDATE event_bracket_matches
      SET athlete1_registration_id = p_winner_registration_id,
          updated_at = now()
      WHERE id = v_next_match.id;
    ELSIF v_next_match.athlete2_registration_id IS NULL THEN
      UPDATE event_bracket_matches
      SET athlete2_registration_id = p_winner_registration_id,
          updated_at = now()
      WHERE id = v_next_match.id;
    END IF;
  END IF;

  -- 8️⃣ Retornar resultado
  RETURN jsonb_build_object(
    'success', true,
    'matchId', p_match_id,
    'winnerId', p_winner_registration_id,
    'status', 'COMPLETED',
    'completedAt', now(),
    'nextMatchId', v_next_match.id
  );
END;
$$;
```

**Garantias:**
- Transação atômica (resultado + avanço)
- Lock `FOR UPDATE` previne race conditions
- Validação completa de regras de negócio
- Avanço automático do vencedor

---

## FASE 3 — EDGE FUNCTION: `record-match-result`

**Arquivo:** `supabase/functions/record-match-result/index.ts`

**Responsabilidades:**
1. Autenticação + validação de role (ADMIN_TENANT)
2. Verificação de impersonation (superadmin)
3. Buscar match para validar tenant
4. Chamar RPC `record_match_result_rpc`
5. Retornar feedback claro

**Estrutura:**
```typescript
interface RecordResultRequest {
  matchId: string;
  winnerRegistrationId: string;
  impersonationId?: string;
}
```

**Config:** `supabase/config.toml`
```toml
[functions.record-match-result]
verify_jwt = false
```

---

## FASE 4 — TYPES (EXTENSÃO MÍNIMA)

### 4.1 Atualizar `EventBracketMatch` em `src/types/event.ts`

```typescript
export interface EventBracketMatch {
  id: string;
  tenant_id: string;
  bracket_id: string;
  category_id: string;
  round: number;
  position: number;
  athlete1_registration_id: string | null;
  athlete2_registration_id: string | null;
  winner_registration_id: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'BYE';
  meta: MatchMeta;
  // P2.5 — Campos de resultado
  completed_at: string | null;
  recorded_by: string | null;
  // Timestamps
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
```

### 4.2 Novo Helper

```typescript
// Helper: pode registrar resultado no match
export function canRecordMatchResult(
  match: EventBracketMatch,
  bracketStatus: BracketStatus
): boolean {
  return (
    bracketStatus === 'PUBLISHED' &&
    match.status === 'SCHEDULED' &&
    match.athlete1_registration_id !== null &&
    match.athlete2_registration_id !== null
  );
}
```

---

## FASE 5 — UI (MINIMALISTA E SEGURA)

### 5.1 Atualizar `BracketMatchCard.tsx`

**Adições:**
- Props: `isAdmin`, `bracketStatus`, `onResultRecorded`
- Botão "Registrar Resultado" (condicional)
- Modal de confirmação com seleção de vencedor
- Visual de match COMPLETED com vencedor destacado

**Condições para exibir botão:**
```typescript
const canRecord = 
  isAdmin && 
  bracketStatus === 'PUBLISHED' &&
  match.status === 'SCHEDULED' &&
  !!athlete1 && !!athlete2;
```

**Modal simples:**
- Radio buttons: Atleta 1 / Atleta 2
- Aviso: "Essa ação é irreversível"
- Botão "Confirmar Resultado"

### 5.2 Visual de Match Completo

```typescript
// Se COMPLETED, destacar vencedor
const isWinner = (registrationId: string | null) => 
  match.status === 'COMPLETED' && 
  match.winner_registration_id === registrationId;

// Aplicar classe condicional
<div className={cn(
  'flex items-center gap-2 py-1',
  isWinner(match.athlete1_registration_id) && 'bg-green-50 dark:bg-green-950/20 font-bold'
)}>
```

### 5.3 Atualizar `BracketViewer.tsx`

**Passar novas props para BracketMatchCard:**
```tsx
<BracketMatchCard
  key={match.id}
  match={match}
  athletes={athletes}
  compact
  isAdmin={isAdmin}
  bracketStatus={bracket.status}
  onResultRecorded={() => {
    queryClient.invalidateQueries({ queryKey: ['event-bracket-matches', bracketId] });
  }}
/>
```

---

## FASE 6 — i18n (NOVAS CHAVES)

### pt-BR
```typescript
'events.brackets.recordResult': 'Registrar Resultado',
'events.brackets.selectWinner': 'Selecione o Vencedor',
'events.brackets.confirmResult': 'Confirmar Resultado',
'events.brackets.resultRecorded': 'Resultado registrado com sucesso!',
'events.brackets.resultError': 'Erro ao registrar resultado',
'events.brackets.resultWarning': 'Essa ação é irreversível. O resultado não poderá ser alterado.',
'events.brackets.completed': 'Concluída',
'events.brackets.winner': 'Vencedor',
'events.brackets.bothAthletesMustBeDefined': 'Ambos os atletas devem estar definidos',
'events.brackets.matchAlreadyCompleted': 'Esta luta já foi finalizada',
```

### en
```typescript
'events.brackets.recordResult': 'Record Result',
'events.brackets.selectWinner': 'Select Winner',
'events.brackets.confirmResult': 'Confirm Result',
'events.brackets.resultRecorded': 'Result recorded successfully!',
'events.brackets.resultError': 'Error recording result',
'events.brackets.resultWarning': 'This action is irreversible. The result cannot be changed.',
'events.brackets.completed': 'Completed',
'events.brackets.winner': 'Winner',
'events.brackets.bothAthletesMustBeDefined': 'Both athletes must be defined',
'events.brackets.matchAlreadyCompleted': 'This match is already completed',
```

### es
```typescript
'events.brackets.recordResult': 'Registrar Resultado',
'events.brackets.selectWinner': 'Seleccione el Ganador',
'events.brackets.confirmResult': 'Confirmar Resultado',
'events.brackets.resultRecorded': '¡Resultado registrado con éxito!',
'events.brackets.resultError': 'Error al registrar resultado',
'events.brackets.resultWarning': 'Esta acción es irreversible. El resultado no podrá ser modificado.',
'events.brackets.completed': 'Completada',
'events.brackets.winner': 'Ganador',
'events.brackets.bothAthletesMustBeDefined': 'Ambos atletas deben estar definidos',
'events.brackets.matchAlreadyCompleted': 'Este combate ya fue completado',
```

---

## FASE 7 — ATUALIZAÇÃO DO TRIGGER P2.4

### Ajuste Necessário

O trigger `validate_bracket_immutability` do P2.4 bloqueia **qualquer** UPDATE em matches de brackets PUBLISHED. Para P2.5 funcionar, precisamos permitir a atualização controlada de:
- `winner_registration_id`
- `status` (SCHEDULED → COMPLETED)
- `completed_at`, `recorded_by`
- `athlete1_registration_id`, `athlete2_registration_id` (avanço do vencedor)

**Trigger Atualizado:**
```sql
CREATE OR REPLACE FUNCTION validate_bracket_immutability()
RETURNS TRIGGER AS $$
DECLARE
  v_bracket_status text;
BEGIN
  IF TG_TABLE_NAME = 'event_brackets' THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.status = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Cannot modify published bracket';
      END IF;
      RETURN NEW;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
      IF OLD.status = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Cannot delete published bracket';
      END IF;
      RETURN OLD;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'event_bracket_matches' THEN
    SELECT status INTO v_bracket_status
    FROM event_brackets
    WHERE id = COALESCE(NEW.bracket_id, OLD.bracket_id);
    
    IF v_bracket_status = 'PUBLISHED' THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Cannot delete matches from published bracket';
      END IF;
      
      IF TG_OP = 'UPDATE' THEN
        -- P2.5: Permitir apenas transição SCHEDULED→COMPLETED ou avanço de atletas
        IF OLD.status = 'COMPLETED' THEN
          -- Match já completado é IMUTÁVEL
          RAISE EXCEPTION 'Cannot modify completed match';
        END IF;
        
        -- Permitir apenas campos autorizados
        IF (
          OLD.round IS DISTINCT FROM NEW.round OR
          OLD.position IS DISTINCT FROM NEW.position OR
          OLD.bracket_id IS DISTINCT FROM NEW.bracket_id OR
          OLD.category_id IS DISTINCT FROM NEW.category_id OR
          OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
        ) THEN
          RAISE EXCEPTION 'Cannot modify structural fields of match in published bracket';
        END IF;
        
        -- Permitir: status, winner, completed_at, recorded_by, athletes (para avanço)
        RETURN NEW;
      END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
```

---

## ARQUIVOS A CRIAR/MODIFICAR

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| Migration SQL | CRIAR | Colunas + constraints + trigger + RPC + trigger ajustado |
| `supabase/functions/record-match-result/index.ts` | CRIAR | Edge Function orquestradora |
| `supabase/config.toml` | EDITAR | +1 function |
| `src/types/event.ts` | EDITAR | +2 campos + helper |
| `src/components/events/BracketMatchCard.tsx` | EDITAR | Botão resultado + visual |
| `src/components/events/BracketViewer.tsx` | EDITAR | Passar novas props |
| `src/locales/pt-BR.ts` | EDITAR | +10 keys |
| `src/locales/en.ts` | EDITAR | +10 keys |
| `src/locales/es.ts` | EDITAR | +10 keys |

---

## QA FINAL — P2.5 (CHECKLIST)

### Banco de Dados
- [ ] Colunas `completed_at` e `recorded_by` existem
- [ ] Constraint `winner_must_be_participant` funciona
- [ ] Trigger bloqueia resultado em DRAFT
- [ ] Trigger bloqueia regravação de resultado
- [ ] RPC avança vencedor corretamente
- [ ] Match COMPLETED é imutável

### Edge Function
- [ ] Só admin pode registrar
- [ ] Impersonation validado para superadmin
- [ ] Tenant isolation mantido
- [ ] Erro claro em validações

### UI
- [ ] Botão só aparece quando permitido
- [ ] Modal exige seleção de vencedor
- [ ] Aviso de irreversibilidade visível
- [ ] Vencedor destacado após registro
- [ ] Próximo round atualizado automaticamente

### Segurança
- [ ] Público só visualiza resultados
- [ ] Nenhuma edição após COMPLETED
- [ ] Tenant isolation mantido

---

## CRITÉRIOS DE FREEZE

Quando todos os itens acima estiverem ✅:

```text
P2.5 = DONE
EVENT FLOW COMPLETO: Inscrição → Chave → Resultado
FREEZE AUTORIZADO
```

---

## RESULTADO ESPERADO

Após P2.5:
- ✅ Resultados registrados de forma atômica
- ✅ Vencedor avança automaticamente
- ✅ Match completado é imutável
- ✅ UI minimalista e segura
- ✅ Zero regressão em P2.1/P2.2/P2.3/P2.4
- ✅ Fluxo completo de eventos ponta a ponta
