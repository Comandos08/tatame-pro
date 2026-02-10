

# PI FIX — Login Stuck (P0 Bloqueante)

## Problema

O callback `onAuthStateChange` e `async` e faz `await fetchProfile(...)` **antes** de setar `isLoading = false`. Isso bloqueia a transicao auth e impede o IdentityContext de reagir a tempo. O usuario fica preso em `/login` com spinner infinito.

## Solucao (conforme sua diretriz)

### 1. AuthContext.tsx — Callback sincrono + useEffect separado para profile

**onAuthStateChange**: remover `async`, setar session/authState/isLoading imediatamente, sem await.

**initSession**: mesma logica — setar estado de auth imediatamente, sem esperar profile.

**Novo useEffect**: carregar profile baseado em `session?.user?.id`, com cleanup `cancelled` flag para StrictMode safety.

Remover `fetchProfile` de dentro do callback e do initSession. Profile passa a ser responsabilidade exclusiva do novo effect.

```text
// Callback (sincrono):
onAuthStateChange((event, session) => {
  setSession(session);
  setAuthState(session ? "authenticated" : "unauthenticated");
  if (!session) setCurrentUser(null);
  setIsLoading(false);
});

// initSession (sincrono apos getSession):
const { data } = await supabase.auth.getSession();
setSession(data.session);
setAuthState(data.session ? "authenticated" : "unauthenticated");
setIsLoading(false);

// Novo effect (deterministico):
useEffect(() => {
  if (!session?.user) return;
  let cancelled = false;
  fetchProfile(session.user).then(profile => {
    if (!cancelled && mountedRef.current) setCurrentUser(profile);
  });
  return () => { cancelled = true; };
}, [session?.user?.id]);
```

### 2. Login.tsx — Reset isSubmitting

Adicionar `setIsSubmitting(false)` apos `signIn` bem-sucedido, para que o botao volte ao normal caso a navegacao demore.

```text
try {
  await signIn(email, password);
  setIsSubmitting(false);  // <-- NOVO
  toast({ ... });
} catch (error) { ... }
```

## Arquivos Afetados

| Arquivo | Mudanca |
|---------|---------|
| `src/contexts/AuthContext.tsx` | Callback sincrono, initSession sincrono, novo useEffect para profile |
| `src/pages/Login.tsx` | Reset isSubmitting no sucesso |

## Risco

Baixo. Nao altera RLS, permissoes, nem contracts de acesso. Apenas corrige a ordem de transicao de estado.

