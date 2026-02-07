

# Plano: Normalização de Slugs e Correção de Anomalias

## Resumo do Diagnóstico

### Problemas Identificados

| Problema | Localização | Status Atual |
|----------|-------------|--------------|
| Função `generateSlug` duplicada | `CreateTenantDialog.tsx` (linhas 55-62) + `resolve-identity-wizard/index.ts` (linhas 328-336) | Código duplicado sem validação de palavras reservadas |
| Validação de slugs reservados inexistente | Formulários de criação | Não há bloqueio para slugs como "admin", "auth", "login" |
| Chave de tradução `admin.slugInvalid` ausente | Locales | Não existe nos arquivos de idioma |
| Anomalias no banco de dados | Tabela `tenants` | 2 registros com problemas: `+FIGHT CT` (prefixo +) e `JuJitsu-Brasil` (maiúsculas no slug) |
| Textos hardcoded | `EditTenantDialog.tsx` | Strings literais em português (não usa i18n) |

### Dados Anômalos no Banco

```text
┌────────────────────────────────────┬──────────────────────────┬─────────────────────────┐
│ ID                                 │ Nome                     │ Slug                    │
├────────────────────────────────────┼──────────────────────────┼─────────────────────────┤
│ 9adcfd7a-ba33-4881-8ce5-1c7ddb8f4843 │ +FIGHT CT - Jiu-Jitsu  │ fight-ct---jiu-jitsu    │
│ 1584e2c3-8610-46dc-a19c-d221f28f2f7f │ JuJitsu Brasil         │ JuJitsu-Brasil          │
└────────────────────────────────────┴──────────────────────────┴─────────────────────────┘
```

---

## Tarefas de Implementação

### Tarefa 1: Criar Utilitário Central `slugify.ts`

**Arquivo:** `src/lib/slugify.ts` (NOVO)

Criar utilitário centralizado com validação de palavras reservadas:

```typescript
/**
 * Palavras reservadas que não podem ser usadas como slugs.
 * Estas rotas são usadas pelo sistema e conflitariam com tenants.
 */
const RESERVED_SLUGS = ['admin', 'auth', 'login', 'logout', 'help', 'portal', 'api', 'app'];

/**
 * Gera slug URL-safe a partir de texto.
 * - Converte para minúsculas
 * - Remove acentos
 * - Substitui espaços e caracteres especiais por hífen
 * - Remove hífens duplicados
 * - Remove hífens no início e fim
 */
export function slugify(text: string): string {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9]+/g, '-')     // Substitui não-alfanuméricos por hífen
    .replace(/-+/g, '-')              // Remove hífens duplicados
    .replace(/^-+|-+$/g, '');         // Remove hífens nas pontas
}

/**
 * Verifica se um slug é válido (não vazio e não reservado).
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length === 0) return false;
  return !RESERVED_SLUGS.includes(slug.toLowerCase());
}

/**
 * Lista de slugs reservados para validação externa.
 */
export const reservedSlugs = RESERVED_SLUGS;
```

---

### Tarefa 2: Refatorar `CreateTenantDialog.tsx`

**Arquivo:** `src/components/admin/CreateTenantDialog.tsx`

Alterações:

1. **Remover função interna `generateSlug`** (linhas 55-62)
2. **Importar utilitário centralizado**
3. **Adicionar validação de slug reservado antes do submit**

```typescript
// Adicionar import
import { slugify, isValidSlug } from '@/lib/slugify';

// Remover função generateSlug local (linhas 55-62)

// Alterar handleNameChange (linhas 64-69)
const handleNameChange = (value: string) => {
  setName(value);
  if (!slug || slug === slugify(name)) {
    setSlug(slugify(value));
  }
};

// No onChange do input de slug (linha 177)
onChange={(e) => setSlug(slugify(e.target.value))}

// Adicionar validação no mutationFn (antes da verificação de slug único)
if (!isValidSlug(slug)) {
  throw new Error(t('admin.slugInvalid'));
}
```

---

### Tarefa 3: Adicionar Chaves de Tradução

**Arquivos:** `src/locales/pt-BR.ts`, `src/locales/en.ts`, `src/locales/es.ts`

Adicionar após a linha com `admin.slugInUse`:

```typescript
// pt-BR.ts
'admin.slugInvalid': 'Slug inválido ou reservado.',

// en.ts
'admin.slugInvalid': 'Invalid or reserved slug.',

// es.ts
'admin.slugInvalid': 'Slug inválido o reservado.',
```

---

### Tarefa 4: Atualizar Edge Function `resolve-identity-wizard`

**Arquivo:** `supabase/functions/resolve-identity-wizard/index.ts`

Alterar a função `generateSlug` (linhas 328-336) para usar lógica consistente:

```typescript
function generateSlug(name: string): string {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-")     // replace non-alphanumeric with hyphen
    .replace(/-+/g, "-")              // remove duplicate hyphens
    .replace(/^-+|-+$/g, "")          // trim hyphens from edges
    .substring(0, 48);
}
```

Adicionar validação de palavras reservadas no fluxo de criação:

```typescript
// Após gerar baseSlug (linha 429)
const RESERVED_SLUGS = ['admin', 'auth', 'login', 'logout', 'help', 'portal', 'api', 'app'];

if (RESERVED_SLUGS.includes(baseSlug)) {
  return {
    status: "ERROR",
    error: { code: "RESERVED_SLUG", message: "This organization name would create a reserved URL." },
  };
}
```

---

### Tarefa 5: Internacionalizar `EditTenantDialog.tsx`

**Arquivo:** `src/components/admin/EditTenantDialog.tsx`

Substituir strings hardcoded por chamadas `t()`:

| Linha | Antes | Depois |
|-------|-------|--------|
| 81 | `'Nome é obrigatório'` | `t('admin.nameRequired')` |
| 85 | `'Selecione pelo menos uma modalidade'` | `t('admin.selectModality')` |
| 105 | `'Organização atualizada com sucesso!'` | `t('admin.organizationUpdatedSuccess')` |
| 109 | `'Erro ao atualizar organização'` | `t('admin.organizationUpdateError')` |
| 117 | `'Editar Organização'` | `t('admin.editOrganization')` |
| 119 | Template literal com nome | `t('admin.editOrganizationDesc', { name: tenant.name })` |
| 125 | `'Nome da organização *'` | `t('admin.organizationNameLabel')` + ` *` |
| 134 | `'Slug (URL)'` | `t('admin.slugLabel')` |
| 145 | `'O slug não pode ser alterado...'` | `t('admin.slugImmutable')` |
| 149 | `'Modalidades *'` | `t('admin.modalities')` + ` *` |
| 166 | `'Idioma padrão'` | `t('admin.defaultLanguage')` |
| 182 | `'Cor primária'` | `t('admin.primaryColor')` |
| 201 | `'Descrição'` | `t('admin.descriptionLabel')` |
| 212 | `'Status da organização'` | `t('admin.organizationStatus')` |
| 214 | Strings de status | `t('admin.statusActiveDesc')` / `t('admin.statusInactiveDesc')` |
| 226 | `'Cancelar'` | `t('common.cancel')` |
| 234 | `'Salvando...'` | `t('common.saving')` |
| 236 | `'Salvar Alterações'` | `t('common.saveChanges')` |

Adicionar chaves de tradução ausentes nos três arquivos de locale.

---

### Tarefa 6 (Opcional/Manual): Script de Correção de Dados

**Fora do escopo do Lovable** — Executar manualmente via SQL Editor:

```sql
-- Corrigir slugs anômalos
UPDATE tenants 
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        NORMALIZE(name, NFD), 
        '[\u0300-\u036f]', '', 'g'
      ),
      '[^a-z0-9]+', '-', 'gi'
    ),
    '-+', '-', 'g'
  )
)
WHERE slug ~ '--' 
   OR slug ~ '^-' 
   OR slug ~ '-$'
   OR slug ~ '[A-Z]'
   OR slug ~ '[^a-z0-9-]';

-- Verificar conflitos antes de aplicar
SELECT id, name, slug, 
  LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'), '-+', '-', 'g')) as new_slug
FROM tenants
WHERE slug ~ '--' OR slug ~ '[A-Z]';
```

---

## Arquivos Modificados

| Arquivo | Ação |
|---------|------|
| `src/lib/slugify.ts` | CRIAR |
| `src/components/admin/CreateTenantDialog.tsx` | MODIFICAR |
| `src/components/admin/EditTenantDialog.tsx` | MODIFICAR (i18n) |
| `supabase/functions/resolve-identity-wizard/index.ts` | MODIFICAR |
| `src/locales/pt-BR.ts` | ADICIONAR chaves |
| `src/locales/en.ts` | ADICIONAR chaves |
| `src/locales/es.ts` | ADICIONAR chaves |

---

## Critérios de Aceitação

- [ ] Utilitário `slugify.ts` centralizado criado
- [ ] `CreateTenantDialog` usa `slugify` importado (não local)
- [ ] Validação de slugs reservados implementada (admin, auth, login, etc.)
- [ ] Mensagem de erro `admin.slugInvalid` exibida quando apropriado
- [ ] Edge Function usa mesma lógica de normalização
- [ ] Hífens duplicados são removidos automaticamente
- [ ] `EditTenantDialog` totalmente internacionalizado
- [ ] Build compila sem erros
- [ ] Chaves i18n consistentes nos 3 idiomas

---

## Seção Técnica

### Lógica de Normalização (Fluxo)

```text
Entrada: "+FIGHT CT - Jiu-Jitsu"
         ↓
toLowerCase(): "+fight ct - jiu-jitsu"
         ↓
normalize('NFD'): "+fight ct - jiu-jitsu"
         ↓
remove acentos: "+fight ct - jiu-jitsu"
         ↓
replace [^a-z0-9]+: "-fight-ct---jiu-jitsu-"
         ↓
remove hífens duplicados: "-fight-ct-jiu-jitsu-"
         ↓
trim hífens: "fight-ct-jiu-jitsu"
         ↓
Resultado: "fight-ct-jiu-jitsu" ✅
```

### Palavras Reservadas

```typescript
const RESERVED_SLUGS = [
  'admin',   // Painel administrativo
  'auth',    // Autenticação
  'login',   // Login
  'logout',  // Logout
  'help',    // Ajuda
  'portal',  // Portal do atleta
  'api',     // Reservado para API
  'app'      // Reservado para aplicação
];
```

