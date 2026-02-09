

# PI B1 — Normalização de Estados do Sistema

## Resumo

Criar um contrato canonico `AsyncState<T>` e um helper `normalizeAsyncState` que padronizam todos os fluxos assincronos do sistema. Substituir padroes dispersos como `if (!data) return null`, `if (isLoading)`, e decisoes por `undefined`/truthiness por decisoes baseadas em `state` explicito (`EMPTY | LOADING | OK | ERROR`).

---

## Escopo identificado

### Problema atual (diagnostico)

- **20 paginas** usam `if (!tenant) return null` — renderizacao silenciosa sem feedback
- **77 arquivos** contem padroes de `if (!data)`, `if (isLoading)`, `return null` para decisoes de fluxo
- Hooks async retornam shapes inconsistentes (alguns com `isLoading/isError`, outros com `status` customizado como `DiagnosticsStatus`)
- Gates (BillingGate, OnboardingGate, RequireFeature) ja sao fail-closed (B2/A3), mas componentes consumidores ainda decidem por heuristica
- Componentes UX ja existem: `LoadingState`, `EmptyStateCard`, `BlockedStateCard`, `TemporaryErrorCard` — mas nao sao usados sistematicamente

### O que NAO muda

- Nenhuma logica de permissao (A3/A4 soberanos)
- Nenhuma flag critica (B2 soberano)
- Nenhum RLS, migration, Edge Function
- Nenhuma rota nova
- Gates existentes mantem sua logica; apenas passam a consumir `state` em vez de booleans dispersos

---

## Plano de execucao

### Fase 1 — Contrato e Helper (2 arquivos novos)

**1.1 Criar `src/types/async.ts`**

Define o contrato canonico:
- `SystemState = 'EMPTY' | 'LOADING' | 'OK' | 'ERROR'`
- `AsyncState<T>` com campos `state`, `data`, `error` e invariantes documentadas

**1.2 Criar `src/lib/async/normalizeAsyncState.ts`**

Helper unico que converte a shape do React Query (`{ data, isLoading, isError, error }`) para `AsyncState<T>`:
- `isLoading` -> `LOADING`
- `isError` -> `ERROR`
- `data` nulo/undefined/array vazio -> `EMPTY`
- `data` valido -> `OK`

### Fase 2 — Hooks async (refactor semantico)

Hooks que retornam dados de React Query passam a expor `AsyncState` alem (ou em vez) de booleans soltos. Prioridade por impacto:

| Hook | Mudanca |
|------|---------|
| `useAccessContract` | Adiciona campo `asyncState` normalizado |
| `useTenantFlagsContract` | Ja tem `ContractStatus`; alinha com `AsyncState` |
| `useAthleteBadges` | Wrapper com `normalizeAsyncState` |
| `useAthleteEvents` | Wrapper com `normalizeAsyncState` |
| `useAthletePhoto` | Wrapper com `normalizeAsyncState` |
| `useTenantStatus` | Wrapper com `normalizeAsyncState` |
| `useTenantDiagnostics` | Ja tem `DiagnosticsStatus`; alinha |
| `useSystemHealthStatus` | Wrapper com `normalizeAsyncState` |
| `useHasAthleteInTenant` | Wrapper com `normalizeAsyncState` |

Abordagem: adicionar campo `asyncState` ao retorno (backward-compatible) sem quebrar consumidores existentes. Consumidores migram progressivamente.

### Fase 3 — Paginas tenant-scoped (eliminar `return null` silencioso)

As ~20 paginas que fazem `if (!tenant) return null` passam a renderizar `<LoadingState>` (ja existente em `src/components/ux/LoadingState.tsx`).

Padrao canonico:

```text
ANTES:  if (!tenant) return null;
DEPOIS: if (!tenant) return <LoadingState titleKey="common.loading" />;
```

Isso e seguro porque essas paginas vivem dentro de `TenantLayout` que ja garante o tenant; o `null` era apenas um guard de tipo. Substituir por loader elimina a "tela branca silenciosa" sem mudar logica.

### Fase 4 — Listagens e dashboards (padrao EMPTY explicito)

Componentes que hoje fazem `if (data?.length === 0) return <vazio ad-hoc>` passam a usar:
1. `normalizeAsyncState` para classificar
2. Switch explicito por `state`:
   - `LOADING` -> `<LoadingState>` ou skeleton existente
   - `ERROR` -> `<TemporaryErrorCard>`
   - `EMPTY` -> `<EmptyStateCard>` (ja existente)
   - `OK` -> renderizacao normal

Paginas prioritarias (ja tem empty states ad-hoc que serao padronizados):
- `EventsList.tsx`
- `MembershipList.tsx`
- `CoachesList.tsx`
- `AcademiesList.tsx`
- `ApprovalsList.tsx`
- `AthleteArea.tsx`
- `AthletePortal.tsx`

### Fase 5 — Validacao

- Grep de validacao: confirmar que `if (!tenant) return null` foi eliminado de paginas
- Confirmar zero regressao em gates (A3/A4/B2)
- Confirmar que `LoadingState`, `EmptyStateCard`, `TemporaryErrorCard` sao os unicos renderizadores de estados nao-OK

---

## Detalhes tecnicos

### Arquivos criados (2)
- `src/types/async.ts` — tipo `AsyncState<T>` e `SystemState`
- `src/lib/async/normalizeAsyncState.ts` — helper canonico

### Arquivos modificados (estimativa: 25-30)
- ~10 hooks em `src/hooks/` — adicionar `asyncState` ao retorno
- ~20 paginas em `src/pages/` — substituir `return null` por `<LoadingState>`
- ~5-7 paginas com listagens — padronizar switch de estados

### Arquivos NAO tocados
- Gates (`RequireFeature`, `BillingGate`, `TenantOnboardingGate`) — ja sao fail-closed
- `src/integrations/supabase/*` — intocavel
- Nenhuma migration SQL
- Nenhuma Edge Function

### Compatibilidade
- Backward-compatible: hooks adicionam campo sem remover os existentes
- Paginas dentro de TenantLayout ja tem tenant garantido; o loader e apenas type-guard visual
- Componentes UX (`LoadingState`, `EmptyStateCard`) ja existem e sao testados

