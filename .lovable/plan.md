
# Plano de Execução: Eliminação de Defaults de Modalidade

## Resumo Executivo

Auditoria completa realizada. O sistema possui múltiplas fontes de injeção implícita de modalidades (BJJ, Jiu-Jitsu) que devem ser removidas para garantir que **nenhum tenant seja criado sem modalidade explicitamente definida**.

---

## ETAPA 1 — Classificação das Ocorrências

### 1.1 Defaults em Banco de Dados (CRÍTICO)

| Arquivo | Linha | Tipo | Ação |
|---------|-------|------|------|
| `supabase/migrations/20260115171534_*.sql` | 28 | DEFAULT ARRAY['BJJ'] | Remover via nova migration |

### 1.2 Backend / Edge Functions (CRÍTICO)

| Arquivo | Linha | Ocorrência | Ação |
|---------|-------|------------|------|
| `supabase/functions/resolve-identity-wizard/index.ts` | 341 | `sport_types: ["BJJ"]` hardcoded | Bloquear criação - exigir modalidade via payload |
| `supabase/functions/generate-digital-card/index.ts` | 120 | `sport_types?.[0] \|\| "Esporte de Combate"` | Fallback aceitável (display only) |
| `supabase/functions/verify-digital-card/index.ts` | 251 | `sport_types?.[0] \|\| "Combat Sport"` | Fallback aceitável (display only) |

### 1.3 Frontend — Defaults em Código (ALTERAR)

| Arquivo | Linha | Ocorrência | Ação |
|---------|-------|------------|------|
| `src/components/admin/CreateTenantDialog.tsx` | 49 | `useState(['Jiu-Jitsu'])` | Mudar para `[]` |
| `src/components/admin/CreateTenantDialog.tsx` | 137 | `setSelectedSports(['Jiu-Jitsu'])` | Mudar para `[]` |
| `src/contexts/TenantContext.tsx` | 120 | `(data.sport_types \|\| ['BJJ'])` | Mudar para `(data.sport_types \|\| [])` |
| `src/pages/GradingSchemesList.tsx` | 105 | `tenant?.sportTypes?.[0] \|\| 'BJJ'` | Mudar para `tenant?.sportTypes?.[0] \|\| ''` |
| `src/pages/GradingSchemesList.tsx` | 136 | `tenant?.sportTypes \|\| ['BJJ']` | Mudar para `tenant?.sportTypes \|\| []` |
| `src/components/events/CreateEventDialog.tsx` | 82 | `tenant?.sportTypes?.[0] \|\| ''` | Já correto |
| `src/pages/AcademiesList.tsx` | 78 | `tenant.sportTypes?.[0] \|\| null` | Já correto |
| `src/pages/CoachesList.tsx` | 132 | `tenant.sportTypes?.[0] \|\| null` | Já correto |

### 1.4 Valores Válidos em Textos (MANTER)

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `src/locales/*.ts` | i18n | Exemplos de preenchimento (BJJ, Jiu-Jitsu) — textos de ajuda |
| `src/types/tenant.ts` | TypeScript | União de tipos SportType — definição válida |
| `src/lib/notifications/examples.ts` | Examples | Dados de exemplo para dev — não afeta produção |

### 1.5 Testes E2E (AJUSTAR)

| Arquivo | Ocorrência | Ação |
|---------|------------|------|
| `e2e/fixtures/personas.seed.ts` | `'demo-bjj'` | Slug de tenant de teste — manter como referência |
| `e2e/events-module.spec.ts` | `TEST_TENANT_SLUG = 'demo-bjj'` | Referência válida a tenant existente |
| `e2e/public-verification.spec.ts` | `TEST_TENANT_SLUG = 'demo-bjj'` | Referência válida a tenant existente |
| `src/lib/notifications/__tests__/notificationEngine.spec.ts` | `'demo-bjj'` | Fixture de teste — manter |

---

## ETAPA 2 — Banco de Dados

### SQL de Migração

```sql
-- Remove DEFAULT de sport_types na tabela tenants
-- Permite NULL para validação explícita
ALTER TABLE public.tenants 
  ALTER COLUMN sport_types DROP DEFAULT;

-- Adiciona constraint NOT NULL para garantir obrigatoriedade
-- (opcional - pode deixar nullable e validar via trigger)
-- ALTER TABLE public.tenants 
--   ALTER COLUMN sport_types SET NOT NULL;

-- Trigger de validação: bloqueia INSERT sem sport_types válido
CREATE OR REPLACE FUNCTION validate_tenant_sport_types()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.sport_types IS NULL OR array_length(NEW.sport_types, 1) IS NULL OR array_length(NEW.sport_types, 1) = 0 THEN
    RAISE EXCEPTION 'sport_types is required and must contain at least one modality';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_tenant_sport_types
  BEFORE INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION validate_tenant_sport_types();
```

---

## ETAPA 3 — Backend / Edge Functions

### resolve-identity-wizard/index.ts

Atualmente a edge function insere `sport_types: ["BJJ"]` hardcoded na linha 341. Deve ser alterado para:

1. **Rejeitar criação sem modalidade** (bloqueante)
2. **Ou receber modalidade via payload** (se wizard for expandido)

**Decisão**: Como o Identity Wizard atual não coleta modalidade, e o tenant deve completar onboarding (TenantOnboarding) onde configura a organização, a solução é:

- Remover `sport_types: ["BJJ"]` do insert
- O banco vai rejeitar via trigger
- Wizard atual não pode criar tenant (comportamento correto para P0)

**Alternativa P0**: Inserir `sport_types: []` array vazio e bloquear onboarding até configurar. O trigger rejeitará arrays vazios.

---

## ETAPA 4 — Frontend

### CreateTenantDialog.tsx

```diff
- const [selectedSports, setSelectedSports] = useState<string[]>(['Jiu-Jitsu']);
+ const [selectedSports, setSelectedSports] = useState<string[]>([]);

  const resetForm = () => {
    setName('');
    setSlug('');
    setDescription('');
-   setSelectedSports(['Jiu-Jitsu']);
+   setSelectedSports([]);
    setDefaultLocale('pt-BR');
    setPrimaryColor('#dc2626');
  };
```

**Validação já existe** na linha 74: `if (selectedSports.length === 0)` → lança erro.

### TenantContext.tsx

```diff
- sportTypes: (data.sport_types || ['BJJ']) as Tenant['sportTypes'],
+ sportTypes: (data.sport_types || []) as Tenant['sportTypes'],
```

### GradingSchemesList.tsx

```diff
  const openCreateDialog = () => {
    setEditingScheme(null);
    setFormData({
      name: '',
-     sport_type: tenant?.sportTypes?.[0] || 'BJJ',
+     sport_type: tenant?.sportTypes?.[0] || '',
      is_default: false,
    });
    setIsDialogOpen(true);
  };

- const sportTypes = tenant?.sportTypes || ['BJJ'];
+ const sportTypes = tenant?.sportTypes || [];
```

---

## ETAPA 5 — Testes

### Teste Negativo a Criar

Arquivo: `e2e/security/tenant-modality-contract.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Tenant Modality Contract', () => {
  test('rejects tenant creation without modality', async ({ page }) => {
    // Login as superadmin
    // Open CreateTenantDialog
    // Fill name, slug
    // DO NOT select any modality
    // Click Create
    // Expect error toast: "Selecione pelo menos uma modalidade"
  });

  test('allows tenant creation with explicit modality', async ({ page }) => {
    // Login as superadmin
    // Open CreateTenantDialog
    // Fill name, slug
    // Select "Judo"
    // Click Create
    // Expect success toast
    // Verify tenant has sport_types = ['Judo']
  });
});
```

### Atualizar Mocks/Factories

- Verificar se fixtures de teste injetam `sport_types: ['BJJ']` implicitamente
- Ajustar para sempre exigir modalidade explícita

---

## ETAPA 6 — Validação Final

| Cenário | Resultado Esperado |
|---------|-------------------|
| Criar tenant sem modalidade (Admin Dashboard) | ❌ Erro: "Selecione pelo menos uma modalidade" |
| Criar tenant sem modalidade (Edge Function) | ❌ Erro: "sport_types is required" |
| Criar tenant com modalidade explícita | ✅ Sucesso |
| Impersonation após mudanças | ✅ Funciona normalmente |
| TenantContext carrega tenant sem sport_types | ✅ Retorna array vazio, não injeta BJJ |

---

## Detalhes Técnicos

### Arquivos a Modificar

1. **Nova migration SQL** — Remove default, adiciona trigger
2. `supabase/functions/resolve-identity-wizard/index.ts` — Remove hardcoded BJJ
3. `src/components/admin/CreateTenantDialog.tsx` — Estado inicial vazio
4. `src/contexts/TenantContext.tsx` — Remove fallback BJJ
5. `src/pages/GradingSchemesList.tsx` — Remove fallback BJJ
6. **Novo teste E2E** — Validação do contrato de modalidade

### Arquivos que NÃO serão modificados

- Locales (pt-BR, en, es) — São exemplos de preenchimento
- `src/types/tenant.ts` — Definição de tipos válida
- Fixtures de teste E2E com `demo-bjj` — É um slug, não um default
- Edge functions de card (generate/verify) — Fallbacks de display são aceitáveis

---

## Confirmação Esperada

Ao final da implementação:

> **"Não existe mais default de modalidade no sistema."**
> 
> **O sistema agora se recusa a criar tenants sem modalidade explicitamente definida.
> Nenhuma modalidade é inferida, presumida ou aplicada por padrão.**
