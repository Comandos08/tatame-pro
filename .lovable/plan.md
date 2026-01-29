
# Plano: Correção Estrutural do Client Supabase Autenticado

## Diagnóstico Raiz

O erro RLS (`42501`) ocorre porque o client Supabase usado em `CreateTenantDialog` envia um token `anon` ao invés do token do usuário autenticado.

### Causa Técnica

A arquitetura atual tem dois problemas estruturais:

1. **Race condition no AuthContext**: 
   - `isLoading = false` é setado imediatamente quando a sessão é detectada
   - `fetchProfile()` roda em `setTimeout(..., 0)` — não-bloqueante
   - Componentes filhos podem renderizar antes do estado estar completamente sincronizado

2. **IdentityContext depende de currentUser**:
   - Linha 170: `if (!currentUser?.id || !isAuthenticated)` → `reset()`
   - Com `currentUser = null` (ainda carregando), a identity é resetada
   - Quando `currentUser` é populado, o `useEffect` pode não re-executar corretamente

3. **Client Supabase singleton usa token do localStorage**:
   - O token pode estar desatualizado ou não sincronizado
   - Não há validação de que o token no client corresponde à sessão ativa

---

## Solução Proposta

### Abordagem: Expor a Session do AuthContext

Em vez de cada componente chamar `supabase.auth.getSession()` (que é o sintoma), vamos **expor a session diretamente do AuthContext** para que componentes críticos possam verificar se o estado está pronto.

### Mudanças

#### 1. `src/contexts/AuthContext.tsx`

Expor a `session` no contexto e criar um getter estável:

```typescript
export interface AuthContextType {
  currentUser: CurrentUser | null;
  session: Session | null;          // ✅ NOVO
  isLoading: boolean;
  isAuthenticated: boolean;
  isSessionReady: boolean;          // ✅ NOVO: session !== null
  isGlobalSuperadmin: boolean;
  currentRolesByTenant: Map<string, AppRole[]>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole, tenantId?: string) => boolean;
}
```

No provider:

```typescript
// ✅ NOVO: isSessionReady indica que a sessão está sincronizada
const isSessionReady = authState === "authenticated" && !!session;

return (
  <AuthContext.Provider
    value={{
      currentUser,
      session,              // ✅ Expor
      isLoading,
      isAuthenticated,
      isSessionReady,       // ✅ Expor
      isGlobalSuperadmin,
      currentRolesByTenant,
      signIn,
      signUp,
      signOut,
      hasRole,
    }}
  >
    {children}
  </AuthContext.Provider>
);
```

#### 2. `src/types/auth.ts`

Atualizar a interface para incluir os novos campos:

```typescript
import { Session } from "@supabase/supabase-js";

export interface AuthContextType {
  currentUser: CurrentUser | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSessionReady: boolean;
  isGlobalSuperadmin: boolean;
  currentRolesByTenant: Map<string, AppRole[]>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole, tenantId?: string) => boolean;
}
```

#### 3. `src/components/admin/CreateTenantDialog.tsx`

Usar `isSessionReady` como guard antes de permitir a mutação:

```tsx
import { useCurrentUser } from '@/contexts/AuthContext';

export function CreateTenantDialog({ onSuccess }: CreateTenantDialogProps) {
  const { isSessionReady } = useCurrentUser();  // ✅ NOVO
  
  // ... estado existente ...

  const createMutation = useMutation({
    mutationFn: async () => {
      // ✅ GUARD ESTRUTURAL: Garantir sessão pronta
      if (!isSessionReady) {
        throw new Error('Aguardando sincronização de sessão. Tente novamente.');
      }

      // ... resto da lógica existente ...
    },
    // ... onSuccess, onError ...
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* ... */}
      <DialogFooter>
        <Button variant="outline" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button 
          onClick={() => createMutation.mutate()} 
          disabled={createMutation.isPending || !isSessionReady}  // ✅ Desabilitar se sessão não pronta
        >
          {/* ... */}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
```

#### 4. `src/contexts/IdentityContext.tsx`

Alterar a dependência de `currentUser?.id` para usar a `session` diretamente:

```typescript
// Linha 86: Usar session ao invés de currentUser
const { session, isAuthenticated, isLoading: authLoading } = useCurrentUser();

// Linha 170: Verificar session ao invés de currentUser
if (!session?.user?.id || !isAuthenticated) {
  reset();
  return;
}
```

---

## Diagrama de Fluxo

```text
                   ┌──────────────────────────────────────┐
                   │          AuthContext                 │
                   │                                      │
                   │  onAuthStateChange                   │
                   │       │                              │
                   │       ▼                              │
                   │  session detected                    │
                   │       │                              │
                   │       ├──► setSession(newSession)    │
                   │       ├──► setAuthState("auth")      │
                   │       ├──► setIsLoading(false)       │
                   │       │                              │
                   │       └──► setTimeout(fetchProfile)  │
                   │              (async, non-blocking)   │
                   └──────────────────────────────────────┘
                                    │
                                    │ isSessionReady = true
                                    │ (session !== null)
                                    ▼
                   ┌──────────────────────────────────────┐
                   │        IdentityContext               │
                   │                                      │
                   │  useEffect depends on:               │
                   │  - authLoading                       │
                   │  - isAuthenticated                   │
                   │  - session?.user?.id  ◄── NOVO       │
                   │                                      │
                   │  checkIdentity() usa session.access_token  │
                   └──────────────────────────────────────┘
                                    │
                                    ▼
                   ┌──────────────────────────────────────┐
                   │      CreateTenantDialog              │
                   │                                      │
                   │  Guard: if (!isSessionReady) throw   │
                   │                                      │
                   │  supabase.from('tenants').insert()   │
                   │  ↓                                   │
                   │  Client usa token do localStorage    │
                   │  que foi sincronizado pelo          │
                   │  onAuthStateChange                   │
                   └──────────────────────────────────────┘
```

---

## Por Que Isso Funciona

1. **session é sincronizada imediatamente** pelo `onAuthStateChange` do Supabase
2. **isSessionReady** é derivado de `session !== null`, não de `currentUser`
3. **currentUser** continua sendo carregado em paralelo (para roles, etc)
4. **CreateTenantDialog** só permite mutação quando a sessão está pronta
5. **IdentityContext** usa `session.user.id` ao invés de `currentUser.id`

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/types/auth.ts` | Adicionar `session` e `isSessionReady` à interface |
| `src/contexts/AuthContext.tsx` | Expor `session` e `isSessionReady` no provider |
| `src/contexts/IdentityContext.tsx` | Usar `session` ao invés de `currentUser` |
| `src/components/admin/CreateTenantDialog.tsx` | Guard com `isSessionReady` |

---

## Impacto

- **Zero breaking changes**: `currentUser` continua funcionando normalmente
- **Retrocompatível**: Componentes existentes não precisam mudar
- **Defensivo**: Guard explícito impede race conditions futuras

---

## Verificação Pós-Implementação

1. Login como Superadmin (`global@tatame.pro`)
2. Acessar `/admin`
3. Clicar "Nova Organização"
4. Preencher dados e submeter
5. Verificar Network tab: `Authorization: Bearer <token_jwt>` deve ter role `authenticated`
6. Verificar sucesso da criação no banco
