
# P2 — Correção de Chaves i18n para Tipo de Filiação

## Resumo do Bug

| Campo | Valor |
|-------|-------|
| Arquivo de UI | `src/components/portal/MembershipStatusCard.tsx` |
| Arquivos de Locale | `src/locales/pt-BR.ts`, `en.ts`, `es.ts` |
| Problema | Chaves `membership.type.first` e `membership.type.renewal` não existem |
| Resultado | UI exibe chave literal em vez do texto traduzido |
| Criticidade | **P2 (Cosmético)** — Zero impacto funcional |

---

## Diagnóstico Técnico

### Código Atual (MembershipStatusCard.tsx, linhas 57-66)

```typescript
const getMembershipTypeLabel = () => {
  switch (type) {
    case "FIRST_MEMBERSHIP":
      return t("membership.type.first");   // ❌ CHAVE NÃO EXISTE
    case "RENEWAL":
      return t("membership.type.renewal"); // ❌ CHAVE NÃO EXISTE
    default:
      return type;
  }
};
```

### Chaves Ausentes

Verificação nos 3 arquivos de locale:

| Chave | pt-BR.ts | en.ts | es.ts |
|-------|----------|-------|-------|
| `membership.type.first` | NAO EXISTE | NAO EXISTE | NAO EXISTE |
| `membership.type.renewal` | NAO EXISTE | NAO EXISTE | NAO EXISTE |

---

## Escopo EXATO (Zero Regressão)

### Arquivos a MODIFICAR

| # | Arquivo | Alteração |
|---|---------|-----------|
| 1 | `src/locales/pt-BR.ts` | Adicionar 2 chaves |
| 2 | `src/locales/en.ts` | Adicionar 2 chaves |
| 3 | `src/locales/es.ts` | Adicionar 2 chaves |

### Arquivos NÃO ALTERADOS

- `src/components/portal/MembershipStatusCard.tsx` — Código já está correto, apenas faltam as chaves

---

## Alterações Propostas

### 1. pt-BR.ts (após linha 77)

```typescript
// Membership Types (ADICIONAR)
'membership.type.first': 'Primeira Filiação',
'membership.type.renewal': 'Renovação',
```

### 2. en.ts (após linha 77)

```typescript
// Membership Types (ADICIONAR)
'membership.type.first': 'First Membership',
'membership.type.renewal': 'Renewal',
```

### 3. es.ts (após linha 77)

```typescript
// Membership Types (ADICIONAR)
'membership.type.first': 'Primera Afiliación',
'membership.type.renewal': 'Renovación',
```

---

## Zero Regressão Garantida

| Aspecto | Garantia |
|---------|----------|
| Código existente | NÃO ALTERADO |
| Componentes | NÃO ALTERADOS |
| Lógica de negócio | NÃO ALTERADA |
| RLS | NÃO ALTERADA |
| Edge Functions | NÃO ALTERADAS |
| Outras chaves i18n | NÃO AFETADAS (apenas adição) |

A correção consiste **APENAS** em adicionar 2 chaves em cada arquivo de locale. Nenhum código existente será modificado.

---

## Resultado Esperado

| Antes | Depois |
|-------|--------|
| `membership.type.first` | `Primeira Filiação` |
| `membership.type.renewal` | `Renovação` |

---

## Validação

Após a correção:

1. Acessar portal do atleta
2. Verificar card "Status da Filiação"
3. Campo "Tipo" deve exibir "Primeira Filiação" ou "Renovação"
4. Testar nos 3 idiomas (pt-BR, en, es)

---

## Critérios de Aceite

- [ ] Chaves adicionadas nos 3 arquivos de locale
- [ ] UI exibe texto traduzido em vez da chave literal
- [ ] Build passa sem erros
- [ ] Nenhum componente alterado
- [ ] Zero regressão

