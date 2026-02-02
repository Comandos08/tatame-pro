
# P2.4 — CHAVES / BRACKETS — "OFFICIAL SNAPSHOT + JUSTIFIED BRACKET"

## AJUSTES OBRIGATÓRIOS APLICADOS

| Ajuste | Descrição | Implementação |
|--------|-----------|---------------|
| **A** | Geração no backend (RPC transacional) | Edge function `generate-event-bracket` com transação |
| **B** | Imutabilidade total de brackets publicados | Trigger SQL bloqueia UPDATE/DELETE em PUBLISHED |
| **C** | Status inicial DRAFT com publicação explícita | Dois botões: "Gerar Chave" → DRAFT, "Publicar" → PUBLISHED |

---

## FASE 1 — BANCO DE DADOS (MIGRATION SQL)

### 1.1 Nova Tabela: `event_brackets`

```sql
CREATE TABLE public.event_brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  event_id uuid NOT NULL REFERENCES public.events(id),
  category_id uuid NOT NULL REFERENCES public.event_categories(id),
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  generated_by uuid REFERENCES public.profiles(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  notes text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, category_id, version)
);
```

### 1.2 Nova Tabela: `event_bracket_matches`

```sql
CREATE TABLE public.event_bracket_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  bracket_id uuid NOT NULL REFERENCES public.event_brackets(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.event_categories(id),
  round integer NOT NULL CHECK (round > 0),
  position integer NOT NULL CHECK (position > 0),
  athlete1_registration_id uuid REFERENCES public.event_registrations(id),
  athlete2_registration_id uuid REFERENCES public.event_registrations(id),
  winner_registration_id uuid REFERENCES public.event_registrations(id),
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'BYE')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(bracket_id, round, position)
);
```

### 1.3 Índices

```sql
CREATE INDEX idx_event_brackets_category ON event_brackets(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_event_brackets_event ON event_brackets(event_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_event_bracket_matches_bracket ON event_bracket_matches(bracket_id) WHERE deleted_at IS NULL;
```

### 1.4 Trigger de Imutabilidade (Ajuste B)

```sql
CREATE OR REPLACE FUNCTION validate_bracket_immutability()
RETURNS TRIGGER AS $$
DECLARE
  v_bracket_status text;
BEGIN
  -- Para event_brackets: bloquear modificações em PUBLISHED
  IF TG_TABLE_NAME = 'event_brackets' THEN
    IF TG_OP = 'UPDATE' THEN
      -- Permitir apenas transição DRAFT→PUBLISHED
      IF OLD.status = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Cannot modify published bracket';
      END IF;
      -- Permitir atualização se ainda DRAFT
      RETURN NEW;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
      IF OLD.status = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Cannot delete published bracket';
      END IF;
      RETURN OLD;
    END IF;
  END IF;

  -- Para event_bracket_matches
  IF TG_TABLE_NAME = 'event_bracket_matches' THEN
    SELECT status INTO v_bracket_status
    FROM event_brackets
    WHERE id = COALESCE(NEW.bracket_id, OLD.bracket_id);
    
    IF v_bracket_status = 'PUBLISHED' THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Cannot delete matches from published bracket';
      END IF;
      IF TG_OP = 'UPDATE' THEN
        -- P2.4: Bloquear tudo. P2.5+ permitirá winner_registration_id
        RAISE EXCEPTION 'Cannot modify matches in published bracket';
      END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER enforce_bracket_immutability
  BEFORE UPDATE OR DELETE ON event_brackets
  FOR EACH ROW EXECUTE FUNCTION validate_bracket_immutability();

CREATE TRIGGER enforce_bracket_match_immutability
  BEFORE UPDATE OR DELETE ON event_bracket_matches
  FOR EACH ROW EXECUTE FUNCTION validate_bracket_immutability();
```

### 1.5 RLS Policies

```sql
ALTER TABLE event_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_bracket_matches ENABLE ROW LEVEL SECURITY;

-- event_brackets: Admin ALL
CREATE POLICY event_brackets_admin_all ON event_brackets
  FOR ALL USING (is_tenant_admin(tenant_id) OR is_superadmin())
  WITH CHECK (is_tenant_admin(tenant_id) OR is_superadmin());

-- event_brackets: Público SELECT (apenas PUBLISHED + evento válido)
CREATE POLICY event_brackets_public_select ON event_brackets
  FOR SELECT USING (
    deleted_at IS NULL
    AND status = 'PUBLISHED'
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_brackets.event_id
      AND e.is_public = true
      AND e.status NOT IN ('DRAFT', 'ARCHIVED', 'CANCELLED')
      AND e.deleted_at IS NULL
    )
  );

-- event_bracket_matches: Admin ALL
CREATE POLICY event_bracket_matches_admin_all ON event_bracket_matches
  FOR ALL USING (is_tenant_admin(tenant_id) OR is_superadmin())
  WITH CHECK (is_tenant_admin(tenant_id) OR is_superadmin());

-- event_bracket_matches: Público SELECT (se bracket PUBLISHED)
CREATE POLICY event_bracket_matches_public_select ON event_bracket_matches
  FOR SELECT USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM event_brackets b
      WHERE b.id = event_bracket_matches.bracket_id
      AND b.status = 'PUBLISHED'
      AND b.deleted_at IS NULL
    )
  );
```

---

## FASE 2 — EDGE FUNCTION: `generate-event-bracket` (Ajuste A)

**Arquivo**: `supabase/functions/generate-event-bracket/index.ts`

Responsabilidades:
1. Autenticação + validação de role (ADMIN_TENANT ou SUPERADMIN)
2. Validação de status do evento (`canGenerateBracket`)
3. Busca determinística de inscrições
4. Cálculo de estrutura (bracket_size, byes, rounds)
5. Transação: INSERT bracket + INSERT matches
6. Retorno de bracket_id + version

```typescript
// Estrutura do payload
interface GenerateBracketRequest {
  categoryId: string;
  eventId: string;
  impersonationId?: string;
}

// Algoritmo determinístico
// 1. Buscar registrations: ORDER BY created_at ASC, id ASC
// 2. bracket_size = Math.pow(2, Math.ceil(Math.log2(n)))
// 3. byes = bracket_size - n
// 4. Round 1: pares (1-2, 3-4...), BYEs no final
// 5. Rounds 2..N: placeholders com meta.source
```

**Config**: `supabase/config.toml`
```toml
[functions.generate-event-bracket]
verify_jwt = false
```

---

## FASE 3 — EDGE FUNCTION: `publish-event-bracket`

**Arquivo**: `supabase/functions/publish-event-bracket/index.ts`

Transição DRAFT → PUBLISHED (Ajuste C):
1. Validar role
2. Validar que bracket está em DRAFT
3. UPDATE status = 'PUBLISHED', published_at = now()

---

## FASE 4 — TYPESCRIPT TYPES

**Arquivo**: `src/types/event.ts`

Adicionar:

```typescript
// P2.4 — Brackets / Chaves

export type BracketStatus = 'DRAFT' | 'PUBLISHED';

export interface EventBracket {
  id: string;
  tenant_id: string;
  event_id: string;
  category_id: string;
  version: number;
  status: BracketStatus;
  generated_by: string | null;
  generated_at: string;
  published_at: string | null;
  notes: string | null;
  meta: BracketMeta;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BracketMeta {
  criterion: string;
  registrations_count: number;
  bracket_size: number;
  byes_count: number;
  registration_ids_hash?: string;
}

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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MatchMeta {
  note?: string;
  source?: { from: string[] };
  is_bye?: boolean;
}

// Helper: pode gerar bracket
export function canGenerateBracket(eventStatus: EventStatus): boolean {
  return eventStatus === 'REGISTRATION_OPEN' || eventStatus === 'REGISTRATION_CLOSED';
}

// Helper: bracket visível publicamente
export function canViewBracketPublic(eventStatus: EventStatus): boolean {
  return !['DRAFT', 'ARCHIVED', 'CANCELLED'].includes(eventStatus);
}
```

---

## FASE 5 — COMPONENTES UI

### 5.1 `src/components/events/GenerateBracketButton.tsx`

Botão com confirmação para gerar bracket:
- Props: `categoryId`, `eventId`, `disabled`
- Chama edge function `generate-event-bracket`
- Toast de sucesso/erro
- Logs obrigatórios

### 5.2 `src/components/events/BracketViewer.tsx`

Visualizador de chave:
- Badge: "Chave Oficial • vX" ou "Rascunho • vX"
- Subtexto: critério + data
- Grid de rounds/matches
- Indica BYEs claramente
- Botão "Publicar" se status=DRAFT e isAdmin

### 5.3 `src/components/events/BracketMatchCard.tsx`

Card de match individual:
- Atleta 1 vs Atleta 2
- Indicador de BYE
- Estilo diferenciado para rounds

---

## FASE 6 — INTEGRAÇÃO UI

### 6.1 `src/pages/EventDetails.tsx`

Na aba de Categorias:
1. Adicionar coluna "Chave" na tabela de categorias
2. Botão "Gerar Chave" por categoria (se `canGenerateBracket`)
3. Link "Ver Chave" se bracket existir
4. Modal ou aba para visualizar BracketViewer

### 6.2 Página ou Modal de Visualização

Exibir:
- Versão atual + histórico de versões
- Status (DRAFT/PUBLISHED)
- Ação de publicar (admin)
- Visualização completa da chave

---

## FASE 7 — i18n

**Novas chaves (pt-BR, en, es)**:

```typescript
// pt-BR
'events.brackets.title': 'Chaves',
'events.brackets.generate': 'Gerar Chave',
'events.brackets.generating': 'Gerando...',
'events.brackets.generated': 'Chave gerada com sucesso!',
'events.brackets.generationError': 'Erro ao gerar chave',
'events.brackets.official': 'Chave Oficial',
'events.brackets.draft': 'Rascunho',
'events.brackets.version': 'Versão {version}',
'events.brackets.criterion': 'Critério: ordem de inscrição',
'events.brackets.snapshotWarning': 'Isso cria uma chave oficial versionada (snapshot). Não recalcula automaticamente.',
'events.brackets.confirmGenerate': 'Confirmar Geração',
'events.brackets.noRegistrations': 'Nenhum inscrito ativo nesta categoria',
'events.brackets.generatedAt': 'Gerada em {date}',
'events.brackets.round': 'Rodada {round}',
'events.brackets.match': 'Luta {match}',
'events.brackets.bye': 'BYE',
'events.brackets.tbd': 'A definir',
'events.brackets.noBrackets': 'Nenhuma chave gerada',
'events.brackets.viewBracket': 'Ver Chave',
'events.brackets.latestVersion': 'Versão mais recente',
'events.brackets.allVersions': 'Todas as versões',
'events.brackets.publish': 'Publicar Chave',
'events.brackets.publishing': 'Publicando...',
'events.brackets.published': 'Chave publicada com sucesso!',
'events.brackets.publishError': 'Erro ao publicar chave',
'events.brackets.publishWarning': 'Após publicar, a chave não poderá mais ser alterada.',
'events.brackets.confirmPublish': 'Confirmar Publicação',
'events.brackets.deleteDraft': 'Excluir Rascunho',
'events.brackets.deleteSuccess': 'Rascunho excluído',
'events.brackets.deleteError': 'Erro ao excluir rascunho',

// en
'events.brackets.title': 'Brackets',
'events.brackets.generate': 'Generate Bracket',
'events.brackets.generating': 'Generating...',
'events.brackets.generated': 'Bracket generated successfully!',
'events.brackets.generationError': 'Error generating bracket',
'events.brackets.official': 'Official Bracket',
'events.brackets.draft': 'Draft',
'events.brackets.version': 'Version {version}',
'events.brackets.criterion': 'Criterion: registration order',
'events.brackets.snapshotWarning': 'This creates an official versioned bracket (snapshot). It does not recalculate automatically.',
'events.brackets.confirmGenerate': 'Confirm Generation',
'events.brackets.noRegistrations': 'No active registrations in this category',
'events.brackets.generatedAt': 'Generated on {date}',
'events.brackets.round': 'Round {round}',
'events.brackets.match': 'Match {match}',
'events.brackets.bye': 'BYE',
'events.brackets.tbd': 'TBD',
'events.brackets.noBrackets': 'No brackets generated',
'events.brackets.viewBracket': 'View Bracket',
'events.brackets.latestVersion': 'Latest version',
'events.brackets.allVersions': 'All versions',
'events.brackets.publish': 'Publish Bracket',
'events.brackets.publishing': 'Publishing...',
'events.brackets.published': 'Bracket published successfully!',
'events.brackets.publishError': 'Error publishing bracket',
'events.brackets.publishWarning': 'After publishing, the bracket cannot be modified.',
'events.brackets.confirmPublish': 'Confirm Publication',
'events.brackets.deleteDraft': 'Delete Draft',
'events.brackets.deleteSuccess': 'Draft deleted',
'events.brackets.deleteError': 'Error deleting draft',

// es (equivalentes)
```

---

## ARQUIVOS A CRIAR/MODIFICAR

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| Migration SQL | CRIAR | Tabelas + triggers + RLS + índices |
| `supabase/functions/generate-event-bracket/index.ts` | CRIAR | RPC transacional (Ajuste A) |
| `supabase/functions/publish-event-bracket/index.ts` | CRIAR | Publicação explícita (Ajuste C) |
| `supabase/config.toml` | EDITAR | +2 functions |
| `src/types/event.ts` | EDITAR | +Types + helpers |
| `src/components/events/GenerateBracketButton.tsx` | CRIAR | Botão de geração |
| `src/components/events/BracketViewer.tsx` | CRIAR | Visualizador |
| `src/components/events/BracketMatchCard.tsx` | CRIAR | Card de match |
| `src/pages/EventDetails.tsx` | EDITAR | Integrar UI |
| `src/locales/pt-BR.ts` | EDITAR | +30 keys |
| `src/locales/en.ts` | EDITAR | +30 keys |
| `src/locales/es.ts` | EDITAR | +30 keys |

---

## GOVERNANÇA PRESERVADA

| Aspecto | Status |
|---------|--------|
| Geração no backend (RPC) | ✅ Ajuste A aplicado |
| Trigger de imutabilidade | ✅ Ajuste B aplicado |
| Status DRAFT → PUBLISHED | ✅ Ajuste C aplicado |
| RLS por tenant | ✅ Isolamento garantido |
| RLS público | ✅ Só vê PUBLISHED + evento válido |
| Determinismo | ✅ ORDER BY created_at ASC, id ASC |
| Versionamento | ✅ UNIQUE(tenant_id, category_id, version) |
| Justificativa | ✅ meta.criterion documentado |
| Rate limiting | ✅ Padrão do projeto |
| Impersonation | ✅ Superadmin requer sessão válida |

---

## CRITÉRIOS DE ACEITE

| Critério | Resultado Esperado |
|----------|-------------------|
| Admin gera bracket (backend) | ✅ |
| Bracket criado como DRAFT | ✅ |
| Admin pode publicar DRAFT | ✅ |
| Bracket PUBLISHED imutável | ✅ |
| Geração determinística | ✅ |
| Público só vê PUBLISHED | ✅ |
| UI exibe versão + critério | ✅ |
| BYEs indicados | ✅ |
| Zero impacto em P2.1/P2.2/P2.3 | ✅ |
| Zero alteração em Auth/Stripe | ✅ |
| Logs de diagnóstico | ✅ |

---

## QA PÓS-P2.4 (CHECKLIST)

### Banco
- [ ] Tabelas criadas com constraints corretos
- [ ] Trigger bloqueia UPDATE/DELETE em PUBLISHED
- [ ] RLS isolamento por tenant funciona
- [ ] RLS público só vê PUBLISHED

### Algoritmo (via Edge Function)
- [ ] n=0 → erro amigável "sem inscritos"
- [ ] n=1 → 1 match com BYE
- [ ] n=3 → bracket_size=4, 1 BYE
- [ ] n=8 → bracket_size=8, 0 BYEs
- [ ] Determinismo: 2x = mesma estrutura

### UI
- [ ] Botão "Gerar Chave" visível para admin
- [ ] Botão "Publicar" visível para DRAFT
- [ ] Bracket exibido corretamente
- [ ] Atleta vê apenas PUBLISHED
- [ ] i18n completo

---

## RESULTADO ESPERADO

Após P2.4:
- ✅ Chaves geradas no backend (transacional)
- ✅ Snapshots versionados e imutáveis após publicação
- ✅ Fluxo DRAFT → PUBLISHED explícito
- ✅ Transparência: "critério: ordem de inscrição"
- ✅ Base pronta para P2.5 (resultados/vencedores)
- ✅ Zero regressão

