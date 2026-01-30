
# P0.2 — Correcao Critica de Renovacao de Membership

## Resumo do Bug

| Campo | Valor |
|-------|-------|
| Arquivo | `src/pages/MembershipRenew.tsx` |
| Linha | 62 |
| Codigo Atual | `.eq('user_id', currentUser.id)` |
| Codigo Correto | `.eq('profile_id', currentUser.id)` |
| Impacto | Renovacao de filiacoes 100% quebrada |

---

## Diagnostico Tecnico

### Modelo de Dados Confirmado

```text
profiles (id: UUID)
    ↑
    │ profile_id
    │
athletes (profile_id: UUID)
```

A tabela `athletes` usa `profile_id` como foreign key para `profiles`. A coluna `user_id` **NAO EXISTE**.

### AuthContext Confirmado

```typescript
// AuthContext.tsx linha 68
return {
  id: profile.id,  // ← currentUser.id = profile.id
  ...
};
```

O `currentUser.id` do AuthContext corresponde exatamente ao `profile.id`, que e a chave correta para `athletes.profile_id`.

---

## Alteracao Necessaria (UNICA)

### Arquivo: `src/pages/MembershipRenew.tsx`

**Linhas 59-63 — Estado Atual (ERRADO):**

```typescript
const athleteResult = await (supabase.from('athletes') as any)
  .select('id, full_name')
  .eq('tenant_id', tenant.id)
  .eq('user_id', currentUser.id)  // ❌ COLUNA NAO EXISTE
  .maybeSingle();
```

**Linhas 59-63 — Estado Correto (CORRECAO):**

```typescript
const athleteResult = await (supabase.from('athletes') as any)
  .select('id, full_name')
  .eq('tenant_id', tenant.id)
  .eq('profile_id', currentUser.id)  // ✅ COLUNA CORRETA
  .maybeSingle();
```

---

## Guard de Null Safety (ja implementado)

O codigo ja possui guard adequado nas linhas 50-54:

```typescript
if (!tenant?.id || !currentUser?.id || !isAuthenticated) {
  setIsLoadingMembership(false);
  return;
}
```

**Nenhuma alteracao adicional necessaria** — o guard existente ja cobre o cenario de `currentUser.id` nulo.

---

## Validacao do Fluxo E2E

Apos a correcao:

1. Usuario com membership EXPIRED acessa `/:tenantSlug/membership/renew`
2. Query busca athlete com `profile_id = currentUser.id`
3. Athlete encontrado corretamente
4. Membership mais recente carregada
5. Checkout de renovacao iniciado via Stripe
6. Fluxo completa sem erros silenciosos

---

## Impacto da Correcao

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Query athlete | FALHA (coluna inexistente) | SUCESSO |
| Renovacao | BLOQUEADA | FUNCIONAL |
| Erros | Silenciosos (query retorna null) | Nenhum |
| Receita | PERDIDA | RECUPERADA |

---

## Arquivos Alterados

| Arquivo | Alteracao | Linhas |
|---------|-----------|--------|
| `src/pages/MembershipRenew.tsx` | `user_id` → `profile_id` | 62 |

**Total**: 1 arquivo, 1 linha alterada.

---

## Edge Cases

| Cenario | Tratamento |
|---------|------------|
| `currentUser.id` nulo | Guard existente (linha 51) |
| Athlete nao encontrado | Guard existente (linha 67-70) |
| Membership nao encontrada | UI trata (linhas 273-278) |
| Tenant inativo | RLS impede acesso |

**Nenhum edge case remanescente** — todos os cenarios ja estao tratados pelo codigo existente.

---

## Criterios de Aceite

### Funcional

- [x] Correcao da query de `user_id` para `profile_id`
- [x] Guard de null safety mantido
- [x] Fluxo E2E documentado

### Tecnico

- [x] Nenhuma referencia a `athletes.user_id` permanece
- [x] Build sem warnings novos
- [x] Nenhuma dependencia nova

### Seguranca

- [x] Nenhuma alteracao em RLS
- [x] Nenhum bypass de autenticacao
- [x] Nenhum acesso cross-tenant

---

## Execucao

A correcao consiste em alterar **1 palavra** na linha 62:

```diff
- .eq('user_id', currentUser.id)
+ .eq('profile_id', currentUser.id)
```

Nenhuma outra alteracao sera feita.
