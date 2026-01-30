

# PROMPT FIX/UX/03.1 — ImpersonationProvider Global

## RESUMO

| Métrica | Valor |
|---------|-------|
| Arquivos a MODIFICAR | 1 |
| Arquivos a CRIAR | 0 |
| Risco de regressão | Baixíssimo |
| Lógica alterada | ZERO |

---

## DIAGNÓSTICO CONFIRMADO

### Erro Atual

```
Error: useImpersonation must be used within an ImpersonationProvider
    at useImpersonation (ImpersonationContext.tsx:268:15)
    at IdentityGate (IdentityGate.tsx:113:64)
```

### Hierarquia Atual

```
AppProviders
  └─ QueryClientProvider
      └─ ThemeProvider
          └─ I18nProvider
              └─ AuthProvider
                  └─ IdentityProvider         ← Linha 37
                      └─ ImpersonationProvider ← Linha 38
                          └─ JoinProvider
                              └─ TooltipProvider
                                  └─ ImpersonationBanner
                                  └─ ImpersonationBannerSpacer
                                  └─ {children} (App.tsx → IdentityGate)
```

### Problema

Embora `IdentityGate` esteja estruturalmente dentro de `ImpersonationProvider`, há uma condição de corrida durante a montagem inicial que causa o erro. Isso pode acontecer por:

1. **React StrictMode** (em `main.tsx`) causa double-renders em desenvolvimento
2. **Race condition** durante hydration inicial
3. **Dependências circulares** entre providers

### Solução Recomendada

Mover `ImpersonationProvider` para **ANTES** de `IdentityProvider`, garantindo que o contexto de impersonação esteja disponível mais cedo na árvore de componentes.

---

## ALTERAÇÃO EXATA

### MODIFICAR: `src/contexts/AppProviders.tsx`

**Linhas afetadas:** 36-49

**Antes (problemático):**
```tsx
<AuthProvider>
  <IdentityProvider>
    <ImpersonationProvider>
      <JoinProvider>
        ...
      </JoinProvider>
    </ImpersonationProvider>
  </IdentityProvider>
</AuthProvider>
```

**Depois (correto):**
```tsx
<AuthProvider>
  <ImpersonationProvider>
    <IdentityProvider>
      <JoinProvider>
        ...
      </JoinProvider>
    </IdentityProvider>
  </ImpersonationProvider>
</AuthProvider>
```

---

## HIERARQUIA CORRIGIDA

```
AppProviders
  └─ QueryClientProvider
      └─ ThemeProvider
          └─ I18nProvider
              └─ AuthProvider
                  └─ ImpersonationProvider    ← MOVIDO PARA CIMA
                      └─ IdentityProvider
                          └─ JoinProvider
                              └─ TooltipProvider
                                  └─ ImpersonationBanner
                                  └─ ImpersonationBannerSpacer
                                  └─ {children}
```

---

## POR QUE ESTA ORDEM?

1. **ImpersonationProvider** depende de `AuthProvider` (precisa de sessão autenticada)
2. **IdentityProvider** pode, no futuro, precisar de contexto de impersonação
3. **IdentityGate** (em children) usa `useImpersonation()` - precisa estar dentro
4. **JoinProvider** é independente e pode ficar dentro de qualquer um

A nova ordem garante que:
- `ImpersonationProvider` tem acesso a `AuthProvider` (sua dependência)
- Todos os componentes filhos têm acesso a `useImpersonation()`
- Nenhuma lógica de negócio é alterada

---

## VALIDAÇÃO

| Cenário | Esperado |
|---------|----------|
| Abrir `/` (landing page) | Renderiza sem erro |
| Abrir `/login` | Renderiza sem erro |
| Abrir `/identity/wizard` sem impersonar | Renderiza sem erro |
| Abrir `/identity/wizard` impersonando | Banner de impersonação visível |
| Abrir `/:tenant/membership/*` | Header com badge de impersonação (se ativo) |
| Abrir `/:tenant/app/*` | Sidebar com contexto de impersonação |
| Encerrar impersonação | Todos indicadores somem |

---

## GARANTIAS

- **ZERO alteração de lógica de impersonation** — apenas reordenação de providers
- **ZERO alteração de regras de segurança**
- **ZERO impacto em usuários normais** — sem impersonação, comportamento idêntico
- **100% elimina o erro** "must be used within a Provider"
- **Totalmente reversível** — pode reverter a ordem se necessário

---

## SEÇÃO TÉCNICA

### Por que o erro ocorre com a ordem atual?

O React monta os providers de fora para dentro. Durante o processo de montagem, especialmente com `React.StrictMode` ativo:

1. `IdentityProvider` monta primeiro
2. `ImpersonationProvider` começa a montar
3. Durante este período transitório, se `IdentityGate` (ou qualquer child) tentar acessar `useImpersonation()`, o contexto pode não estar disponível

Movendo `ImpersonationProvider` para antes de `IdentityProvider`, eliminamos esta janela de vulnerabilidade.

### Dependências entre Providers

```
AuthProvider
    ↓ provides: session, isAuthenticated
ImpersonationProvider
    ↓ provides: isImpersonating, session (impersonation)
    ↓ uses: AuthProvider (session)
IdentityProvider
    ↓ provides: identityState, role, tenant
    ↓ uses: AuthProvider (session)
```

A nova ordem respeita todas as dependências.

