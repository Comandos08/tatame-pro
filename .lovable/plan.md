
# Plano: Correcao do Redirect /login → /identity/wizard

## Diagnostico Confirmado

### Dados do Usuario Testado

| Campo | Valor |
|-------|-------|
| Email | `luizfelipevillar@gmail.com` |
| `wizard_completed` | `true` |
| Role | `ATLETA` (tenant: `federacao-demo`) |
| Tenant ativo | `true` |

**Conclusao**: Os dados estao corretos no banco. O problema NAO e de dados.

---

## Causa Raiz: Race Condition no Fluxo de Navegacao

### Fluxo Atual (Problema)

```text
1. Usuario clica "Entrar" (ja autenticado)
         |
         v
2. Login.tsx renderiza
         |
         v
3. useEffect detecta isAuthenticated = true
         |
         v
4. navigate("/portal") IMEDIATAMENTE
         |
         v
5. /portal monta IdentityGate
         |
         v
6. IdentityContext.identityState = ???
         |
         +-- Se "loading" → mostra loader (OK)
         +-- Se "wizard_required" → redirect para /identity/wizard (PROBLEMA)
```

### Problema Especifico

O `Login.tsx` navega para `/portal` baseado APENAS em `isAuthenticated`, **sem aguardar** a resolucao de identidade:

```typescript
// Login.tsx - Linha 29-33
useEffect(() => {
  if (isAuthenticated) {
    navigate("/portal", { replace: true });  // ← NAO espera identityState
  }
}, [isAuthenticated, navigate]);
```

Quando o usuario **ja esta autenticado** e acessa `/login`:
1. `isAuthenticated` ja e `true`
2. O `useEffect` dispara imediatamente
3. O `IdentityContext` pode ainda estar em `"loading"` OU ter um estado stale

Se o `IdentityContext` foi resetado por algum motivo (ex: recarregamento da pagina, mudanca de sessao), ele comeca em `"loading"` e pode transitar para `"wizard_required"` temporariamente.

---

## Solucao Proposta

### Parte 1: Login.tsx - Aguardar Resolucao de Identidade

Modificar o `Login.tsx` para aguardar a resolucao de identidade antes de navegar:

**Arquivo:** `src/pages/Login.tsx`

```typescript
// ADICIONAR import
import { useIdentity } from "@/contexts/IdentityContext";

// DENTRO DO COMPONENTE
const { identityState, redirectPath } = useIdentity();

// SUBSTITUIR useEffect (linhas 29-33)
useEffect(() => {
  // Aguardar auth E identity estarem resolvidos
  if (isAuthenticated && identityState !== "loading") {
    // Se wizard required, deixar o IdentityGate lidar
    if (identityState === "wizard_required") {
      navigate("/identity/wizard", { replace: true });
      return;
    }
    
    // Usar redirectPath do backend (mais preciso que /portal hardcoded)
    const destination = redirectPath || "/portal";
    navigate(destination, { replace: true });
  }
}, [isAuthenticated, identityState, redirectPath, navigate]);
```

### Parte 2: Validacao de Seguranca

Esta mudanca:
- NAO altera nenhuma logica de backend
- NAO modifica tabelas ou RLS
- NAO afeta usuarios nao autenticados
- Respeita o contrato existente do IdentityContext

---

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/Login.tsx` | Adicionar import `useIdentity`, modificar useEffect para aguardar `identityState !== "loading"` |

**Total: 1 arquivo, ~10 linhas alteradas**

---

## Fluxo Apos Correcao

```text
1. Usuario clica "Entrar" (ja autenticado)
         |
         v
2. Login.tsx renderiza
         |
         v
3. useEffect verifica:
   - isAuthenticated = true ✓
   - identityState === "loading" → AGUARDA
         |
         v
4. IdentityContext resolve (Edge Function)
         |
         v
5. identityState = "resolved" (com redirectPath = "/federacao-demo/portal")
         |
         v
6. useEffect detecta identityState !== "loading"
         |
         v
7. navigate(redirectPath) → /federacao-demo/portal
         |
         v
8. Renderiza portal do atleta corretamente ✓
```

---

## Validacao

### Testes Manuais

1. Fazer logout
2. Fazer login com `luizfelipevillar@gmail.com`
3. Verificar que redireciona para `/federacao-demo/portal`
4. Fazer logout
5. Enquanto logado, acessar `/login` diretamente
6. Verificar que redireciona para `/federacao-demo/portal` (nao para wizard)

### Testes E2E Existentes

- `e2e/security/auth-guards.spec.ts` - Verificar que guards funcionam
- `e2e/security/redirect-contract.spec.ts` - Verificar contratos de redirect

---

## Impacto

- Zero regressao funcional
- Corrige o loop de redirect para usuarios autenticados
- Respeita o `redirectPath` do backend
- Nenhuma alteracao em Edge Functions ou banco de dados
