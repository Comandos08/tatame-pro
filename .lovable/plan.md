
# Ajustes Finais: Padronização de Status Billing/Trial

## Análise do Estado Atual

| Arquivo | Chave | Valor Atual | Valor Esperado |
|---------|-------|-------------|----------------|
| `pt-BR.ts` | `billing.status.trialing` | "Em Teste" | "Em Avaliação" |
| `pt-BR.ts` | `billing.status.trial_expired` | "Teste Expirado" | "Período de avaliação expirado" |
| `en.ts` | `billing.status.trialing` | "Trialing" | ✅ OK |
| `en.ts` | `billing.status.trial_expired` | "Trial Expired" | ✅ OK |
| `es.ts` | `billing.status.trialing` | "En Prueba" | "En Período de Prueba" (ajuste menor) |
| `es.ts` | `billing.status.trial_expired` | "Prueba Expirada" | "Período de Prueba Expirado" (ajuste menor) |

---

## Tarefa 1: Atualizar pt-BR.ts (Linhas 1789-1790)

```typescript
// ANTES:
'billing.status.trialing': 'Em Teste',
'billing.status.trial_expired': 'Teste Expirado',

// DEPOIS:
'billing.status.trialing': 'Em Avaliação',
'billing.status.trial_expired': 'Período de avaliação expirado',
```

---

## Tarefa 2: Atualizar es.ts (Linhas 1185-1186) — Opcional, para consistência

```typescript
// ANTES:
'billing.status.trialing': 'En Prueba',
'billing.status.trial_expired': 'Prueba Expirada',

// DEPOIS:
'billing.status.trialing': 'En Período de Prueba',
'billing.status.trial_expired': 'Período de Prueba Expirado',
```

---

## Tarefa 3: Verificar en.ts

Os valores em inglês já estão corretos:
- `'billing.status.trialing': 'Trialing'` ✅
- `'billing.status.trial_expired': 'Trial Expired'` ✅

**Nenhuma alteração necessária.**

---

## Arquivos Modificados

| Arquivo | Ação | Linhas |
|---------|------|--------|
| `src/locales/pt-BR.ts` | MODIFICAR | 1789-1790 |
| `src/locales/es.ts` | MODIFICAR (opcional) | 1185-1186 |

---

## Critérios de Aceitação

- [x] `billing.status.trialing` em pt-BR → "Em Avaliação"
- [x] `billing.status.trial_expired` em pt-BR → "Período de avaliação expirado"
- [x] Consistência com demais traduções de "Trial" → "Avaliação"
- [x] Build sem erros
- [x] Verificação i18n passa
