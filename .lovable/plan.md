
# P2.4 — FINALIZAÇÃO SEGURA COM GOVERNANÇA TOTAL (SAFE MODE)

## ANÁLISE DO ESTADO ATUAL

### ✅ Já Implementado Corretamente
| Componente | Status |
|------------|--------|
| Tabelas `event_brackets` e `event_bracket_matches` | ✅ |
| Trigger de imutabilidade para PUBLISHED | ✅ |
| RLS por tenant + visibilidade pública | ✅ |
| Edge Function de publicação | ✅ |
| UI básica de visualização | ✅ |
| i18n completo | ✅ |

### ❌ Gaps Identificados (Críticos)
| Gap | Risco | Severidade |
|-----|-------|------------|
| Geração usa INSERTs separados (não transacional) | Estado inconsistente se match falhar | CRÍTICO |
| Hash truncado com `.slice(0, 100)` | Auditoria comprometida | ALTO |
| Sem lock de DRAFT único por categoria | Múltiplos DRAFTs possíveis | ALTO |
| UI não verifica DRAFT existente | UX confusa | MÉDIO |

---

## FASE 1 — SQL RPC TRANSACIONAL (CRÍTICO)

### Objetivo
Criar função SQL `generate_event_bracket_rpc` que executa TODO o processo em uma única transação atômica.

### Implementação
```sql
CREATE OR REPLACE FUNCTION generate_event_bracket_rpc(
  p_tenant_id uuid,
  p_event_id uuid,
  p_category_id uuid,
  p_generated_by uuid,
  p_registrations jsonb  -- Array de {id, athlete_id, created_at}
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bracket_id uuid;
  v_version int;
  v_n int;
  v_bracket_size int;
  v_byes int;
  v_rounds int;
  v_reg_ids text[];
  v_hash text;
  v_match_count int := 0;
  v_round int;
  v_pos int;
  v_matches_in_round int;
  v_idx1 int;
  v_idx2 int;
  v_athlete1 uuid;
  v_athlete2 uuid;
  v_is_bye boolean;
  v_reg record;
BEGIN
  -- 1. Verificar se já existe DRAFT para esta categoria
  IF EXISTS (
    SELECT 1 FROM event_brackets
    WHERE category_id = p_category_id
      AND tenant_id = p_tenant_id
      AND status = 'DRAFT'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Draft bracket already exists for this category';
  END IF;

  -- 2. Calcular próxima versão
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM event_brackets
  WHERE category_id = p_category_id
    AND tenant_id = p_tenant_id;

  -- 3. Extrair IDs e calcular hash SHA-256 real
  SELECT array_agg(r->>'id' ORDER BY r->>'created_at', r->>'id')
  INTO v_reg_ids
  FROM jsonb_array_elements(p_registrations) r;

  v_hash := encode(digest(array_to_string(v_reg_ids, '|'), 'sha256'), 'hex');
  v_n := array_length(v_reg_ids, 1);

  -- 4. Calcular estrutura do bracket
  v_bracket_size := power(2, ceil(log(2, greatest(v_n, 2))));
  v_byes := v_bracket_size - v_n;
  v_rounds := ceil(log(2, v_bracket_size));

  -- 5. Inserir bracket
  INSERT INTO event_brackets (
    tenant_id, event_id, category_id, version, status,
    generated_by, meta
  ) VALUES (
    p_tenant_id, p_event_id, p_category_id, v_version, 'DRAFT',
    p_generated_by,
    jsonb_build_object(
      'criterion', 'SEED_BY_CREATED_AT_ASC_ID_ASC',
      'registrations_count', v_n,
      'bracket_size', v_bracket_size,
      'byes_count', v_byes,
      'registration_ids_hash', v_hash
    )
  )
  RETURNING id INTO v_bracket_id;

  -- 6. Criar matches Round 1
  v_matches_in_round := v_bracket_size / 2;
  FOR v_pos IN 1..v_matches_in_round LOOP
    v_idx1 := (v_pos - 1) * 2 + 1;
    v_idx2 := v_idx1 + 1;
    
    v_athlete1 := CASE WHEN v_idx1 <= v_n THEN (v_reg_ids[v_idx1])::uuid ELSE NULL END;
    v_athlete2 := CASE WHEN v_idx2 <= v_n THEN (v_reg_ids[v_idx2])::uuid ELSE NULL END;
    v_is_bye := v_athlete1 IS NULL OR v_athlete2 IS NULL;

    INSERT INTO event_bracket_matches (
      tenant_id, bracket_id, category_id, round, position,
      athlete1_registration_id, athlete2_registration_id,
      status, meta
    ) VALUES (
      p_tenant_id, v_bracket_id, p_category_id, 1, v_pos,
      v_athlete1, v_athlete2,
      CASE WHEN v_is_bye THEN 'BYE' ELSE 'SCHEDULED' END,
      CASE WHEN v_is_bye THEN '{"is_bye": true, "note": "BYE"}'::jsonb ELSE '{}'::jsonb END
    );
    v_match_count := v_match_count + 1;
  END LOOP;

  -- 7. Criar matches para rounds futuros (placeholders)
  FOR v_round IN 2..v_rounds LOOP
    v_matches_in_round := v_matches_in_round / 2;
    FOR v_pos IN 1..v_matches_in_round LOOP
      INSERT INTO event_bracket_matches (
        tenant_id, bracket_id, category_id, round, position,
        athlete1_registration_id, athlete2_registration_id,
        status, meta
      ) VALUES (
        p_tenant_id, v_bracket_id, p_category_id, v_round, v_pos,
        NULL, NULL, 'SCHEDULED',
        jsonb_build_object(
          'note', format('Winner of R%sM%s vs R%sM%s', 
            v_round-1, (v_pos-1)*2+1, v_round-1, (v_pos-1)*2+2),
          'source', jsonb_build_object('from', 
            array[format('R%sM%s', v_round-1, (v_pos-1)*2+1),
                  format('R%sM%s', v_round-1, (v_pos-1)*2+2)])
        )
      );
      v_match_count := v_match_count + 1;
    END LOOP;
  END LOOP;

  -- 8. Retornar resultado
  RETURN jsonb_build_object(
    'success', true,
    'bracketId', v_bracket_id,
    'version', v_version,
    'status', 'DRAFT',
    'matchesCreated', v_match_count,
    'meta', jsonb_build_object(
      'criterion', 'SEED_BY_CREATED_AT_ASC_ID_ASC',
      'registrations_count', v_n,
      'bracket_size', v_bracket_size,
      'byes_count', v_byes,
      'registration_ids_hash', v_hash
    )
  );
END;
$$;
```

### Garantias
- ✅ **Transação atômica**: Falha em qualquer ponto = rollback total
- ✅ **Lock de DRAFT**: Só permite 1 DRAFT por categoria
- ✅ **Hash SHA-256 real**: Sem truncamento
- ✅ **Versionamento correto**: MAX(version) + 1

---

## FASE 2 — EDGE FUNCTION SIMPLIFICADA

### Alterações no `generate-event-bracket/index.ts`

**REMOVER**:
- INSERT direto de bracket (linhas 245-257)
- INSERT direto de matches (linhas 336-338)
- Lógica de rollback manual (linhas 340-352)
- Cálculo de hash truncado (linha 241)

**ADICIONAR**:
- Chamada única à RPC `generate_event_bracket_rpc`

```typescript
// Após validações e busca de registrations...

// Preparar payload para RPC
const registrationsPayload = registrations.map(r => ({
  id: r.id,
  athlete_id: r.athlete_id,
  created_at: r.created_at,
}));

// Chamar RPC transacional
const { data: rpcResult, error: rpcError } = await supabaseAdmin
  .rpc('generate_event_bracket_rpc', {
    p_tenant_id: tenantId,
    p_event_id: eventId,
    p_category_id: categoryId,
    p_generated_by: user.id,
    p_registrations: registrationsPayload,
  });

if (rpcError) {
  console.error('[GENERATE-BRACKET] RPC error:', rpcError);
  return new Response(
    JSON.stringify({ error: rpcError.message }),
    { status: 400, headers: corsHeaders }
  );
}

console.log('[GENERATE-BRACKET] Success via RPC:', rpcResult);

return new Response(
  JSON.stringify(rpcResult),
  { status: 200, headers: corsHeaders }
);
```

### Benefícios
- Edge Function vira **orquestrador puro**
- Toda lógica de mutação no backend SQL
- Zero chance de estado inconsistente

---

## FASE 3 — UI DEFENSIVA (CategoryBracketsSection)

### Lógica Atual (PROBLEMA)
```typescript
const canGenerate = canGenerateBracket(eventStatus) && isAdmin;
// ❌ Não verifica se já existe DRAFT
```

### Lógica Corrigida
```typescript
const draftBracket = brackets.find(b => b.status === 'DRAFT');
const canGenerate = canGenerateBracket(eventStatus) && isAdmin && !draftBracket;
```

### UI Condicional
```tsx
{/* Se existe DRAFT, mostrar opções de Publicar/Excluir */}
{draftBracket && isAdmin && (
  <div className="flex gap-2">
    <Button variant="default" size="sm" onClick={handlePublish}>
      {t('events.brackets.publish')}
    </Button>
    <Button variant="outline" size="sm" onClick={handleDeleteDraft}>
      {t('events.brackets.deleteDraft')}
    </Button>
  </div>
)}

{/* Só mostrar Gerar se não houver DRAFT */}
{canGenerate && !draftBracket && (
  <GenerateBracketButton ... />
)}
```

---

## FASE 4 — i18n (NOVA KEY)

### Adicionar em todos os locales:
```typescript
'events.brackets.draftExists': 'Já existe uma chave em rascunho para esta categoria.',
```

---

## ARQUIVOS A MODIFICAR

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| Migration SQL (NOVO) | CRIAR | Função `generate_event_bracket_rpc` |
| `supabase/functions/generate-event-bracket/index.ts` | EDITAR | Remover INSERTs, chamar RPC |
| `src/components/events/CategoryBracketsSection.tsx` | EDITAR | Validar DRAFT existente |
| `src/locales/pt-BR.ts` | EDITAR | +1 key |
| `src/locales/en.ts` | EDITAR | +1 key |
| `src/locales/es.ts` | EDITAR | +1 key |

---

## QA FINAL (CHECKLIST)

### Banco de Dados
- [ ] RPC `generate_event_bracket_rpc` existe
- [ ] Falha em match → nada é salvo (testável via trigger de erro)
- [ ] Constraint: só 1 DRAFT por categoria
- [ ] Hash SHA-256 completo (64 caracteres hex)

### Edge Function
- [ ] Sem INSERT direto
- [ ] Apenas chamada RPC
- [ ] Retorna erro claro se DRAFT existir

### UI
- [ ] Se DRAFT existir: mostrar "Publicar" e "Excluir"
- [ ] Se DRAFT não existir: mostrar "Gerar"
- [ ] Toast de erro se tentar gerar com DRAFT existente

### Segurança
- [ ] Tenant isolation mantido
- [ ] Superadmin exige impersonation
- [ ] Público só vê PUBLISHED

---

## CRITÉRIOS DE FREEZE

Quando todos os itens acima estiverem ✅:

```
P2.4 = DONE
FREEZE AUTORIZADO
Entrada segura no P2.5
```

---

## RESULTADO ESPERADO

Após a finalização:
- ✅ Geração 100% transacional (zero estado inconsistente)
- ✅ Hash SHA-256 real para auditoria
- ✅ Máximo 1 DRAFT por categoria
- ✅ UI reage corretamente ao estado
- ✅ Base sólida e imutável para P2.5 (resultados)
- ✅ Zero regressão em P2.1/P2.2/P2.3
