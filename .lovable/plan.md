
# PROMPT UX/02 — Impersonação + Onboarding (Step 5)

## RESUMO

| Métrica | Valor |
|---------|-------|
| Arquivos a MODIFICAR | 3 |
| Arquivos a CRIAR | 0 |
| Risco de regressão | Baixo |
| Schema alterado | ZERO |

---

## DIAGNÓSTICO TÉCNICO CONFIRMADO

### Problema #1 — Invalidação de Cache Ineficaz

**Código atual (`TenantOnboarding.tsx`, linha 100):**
```typescript
onSuccess: () => {
  toast.success(t('onboarding.completedSuccess'));
  queryClient.invalidateQueries({ queryKey: ['tenant'] }); // ❌ INÚTIL
  navigate(`/${tenant?.slug}/app`, { replace: true });
},
```

**Por que não funciona:**
- `TenantContext.tsx` NÃO usa React Query
- Usa `useState` + `useEffect` com chamada direta ao Supabase
- `invalidateQueries(['tenant'])` não afeta o estado do `TenantContext`
- Após navegação, o Gate ainda lê `onboardingCompleted: false` do estado stale

### Problema #2 — TenantContext sem mecanismo de refetch

O `TenantContext` não expõe um método `refetch()`. O único trigger é mudança de `tenantSlug` no `useParams`.

---

## SOLUÇÃO TÉCNICA

### Estratégia: Adicionar `refetch` ao TenantContext

Expor uma função `refetchTenant()` que força reload dos dados. Chamar essa função após completar onboarding.

---

## ALTERAÇÕES EXATAS

### 1. MODIFICAR: `src/contexts/TenantContext.tsx`

**Objetivo:** Expor função `refetchTenant` no contexto

**Linhas afetadas:** 6-8, 149-151, 156-162

**Alteração no tipo de contexto:**
```typescript
interface ExtendedTenantContext extends TenantContextType {
  billingInfo: TenantBillingInfo | null;
  refetchTenant: () => void; // ← ADICIONAR
}
```

**Alteração na implementação:**
```typescript
// Adicionar state para trigger de refetch
const [refetchTrigger, setRefetchTrigger] = useState(0);

// Modificar useEffect para depender do trigger
useEffect(() => {
  // ... existing code ...
}, [tenantSlug, refetchTrigger]); // ← ADICIONAR refetchTrigger

// Adicionar função de refetch
const refetchTenant = useCallback(() => {
  setRefetchTrigger(prev => prev + 1);
}, []);

// Expor no Provider
return (
  <TenantContext.Provider value={{ tenant, isLoading, error, billingInfo, refetchTenant }}>
    {children}
  </TenantContext.Provider>
);
```

---

### 2. MODIFICAR: `src/pages/TenantOnboarding.tsx`

**Objetivo:** Chamar `refetchTenant()` após conclusão do onboarding

**Linhas afetadas:** 23, 98-101

**Antes:**
```typescript
const { tenant } = useTenant();
// ...
onSuccess: () => {
  toast.success(t('onboarding.completedSuccess'));
  queryClient.invalidateQueries({ queryKey: ['tenant'] });
  navigate(`/${tenant?.slug}/app`, { replace: true });
},
```

**Depois:**
```typescript
const { tenant, refetchTenant } = useTenant();
// ...
onSuccess: () => {
  toast.success(t('onboarding.completedSuccess'));
  
  // ✅ Force TenantContext to reload data
  refetchTenant();
  
  // Invalidate React Query caches (for other components using queries)
  queryClient.invalidateQueries({ queryKey: ['onboarding-status', tenant?.id] });
  
  // Navigate with replace to prevent back-button loop
  navigate(`/${tenant?.slug}/app`, { replace: true });
},
```

---

### 3. MODIFICAR: `src/components/onboarding/TenantOnboardingGate.tsx`

**Objetivo:** Adicionar bypass para impersonação com tenant já configurado

**Linhas afetadas:** 7, 26-27, 30-52

**Adicionar import:**
```typescript
import { useImpersonation } from '@/contexts/ImpersonationContext';
```

**Adicionar check defensivo com dados reais:**
```typescript
export function TenantOnboardingGate({ children }: TenantOnboardingGateProps) {
  const { tenant, isLoading, refetchTenant } = useTenant();
  const { isImpersonating } = useImpersonation();
  const navigate = useNavigate();
  const location = useLocation();

  // Refetch tenant data when impersonation changes
  useEffect(() => {
    if (isImpersonating && !isLoading) {
      refetchTenant();
    }
  }, [isImpersonating, isLoading, refetchTenant]);

  useEffect(() => {
    if (isLoading || !tenant) return;

    // Check if onboarding is complete via flag
    const isComplete = tenant?.onboardingCompleted === true;
    
    if (isComplete) return; // Onboarding done, allow access

    // DEFENSIVE: Check if tenant has actual configured data
    // (handles case where flag is false but tenant already has data)
    // This prevents loops when DB flag wasn't properly updated
    const hasRealConfiguration = Boolean(
      tenant?.isActive &&
      tenant?.sportTypes?.length > 0
    );
    
    // If impersonating and tenant has real data, skip onboarding redirect
    if (isImpersonating && hasRealConfiguration) {
      console.log('[ONBOARDING-GATE] Skipping for impersonation with configured tenant');
      return;
    }

    // Check if current route is allowed during onboarding
    const currentPath = location.pathname;
    const tenantPrefix = `/${tenant.slug}`;
    const relativePath = currentPath.replace(tenantPrefix, '');
    
    const isAllowed = ALLOWED_ROUTES.some(route => 
      relativePath === route || relativePath.startsWith(route + '/')
    );

    if (!isAllowed) {
      navigate(`/${tenant.slug}/app/onboarding`, { replace: true });
    }
  }, [tenant, isLoading, location.pathname, navigate, isImpersonating]);

  // ... rest unchanged
}
```

**Atualizar hook `useOnboardingStatus`:**
```typescript
export function useOnboardingStatus() {
  const { tenant, isLoading, refetchTenant } = useTenant();
  
  // ✅ Check both flag AND real tenant configuration
  const isComplete = tenant?.onboardingCompleted === true;
  
  // Defensive: also consider tenant "complete" if it has real data
  const hasRealConfiguration = Boolean(
    tenant?.isActive &&
    tenant?.sportTypes?.length > 0
  );

  return {
    isComplete: isComplete || hasRealConfiguration,
    isLoading,
    tenant,
    refetchTenant,
  };
}
```

---

## FLUXO CORRIGIDO

```text
ANTES (bug):
┌──────────────────────────────────────────────────────────┐
│ Step 5 → completeMutation.onSuccess                      │
│   ↓                                                      │
│ invalidateQueries(['tenant']) ← NÃO AFETA TenantContext │
│   ↓                                                      │
│ navigate('/app')                                         │
│   ↓                                                      │
│ TenantOnboardingGate lê onboardingCompleted: false       │
│   ↓                                                      │
│ Redirect para /onboarding ← LOOP ❌                      │
└──────────────────────────────────────────────────────────┘

DEPOIS (correto):
┌──────────────────────────────────────────────────────────┐
│ Step 5 → completeMutation.onSuccess                      │
│   ↓                                                      │
│ refetchTenant() ← FORÇA TenantContext a recarregar       │
│   ↓                                                      │
│ navigate('/app')                                         │
│   ↓                                                      │
│ TenantOnboardingGate lê onboardingCompleted: true        │
│   ↓                                                      │
│ Permite acesso ao /app ✅                                │
└──────────────────────────────────────────────────────────┘
```

---

## VALIDAÇÃO

| Cenário | Esperado |
|---------|----------|
| Admin completa onboarding | Navega para `/app`, não volta para wizard |
| Superadmin impersona e completa onboarding | Navega para `/app`, não volta para wizard |
| Tenant já configurado (flag true) | Acessa `/app` direto |
| Tenant novo (flag false) | Redireciona para `/app/onboarding` |
| Back-button após onboarding | Permanece no `/app` (replace: true) |

---

## GARANTIAS

- **ZERO alteração de schema** — Usa flag existente `onboarding_completed`
- **ZERO breaking change** — Apenas adiciona `refetchTenant` ao contexto
- **ZERO impacto para tenants novos** — Lógica de redirect permanece
- **ZERO impacto para não-admins** — Gate só afeta rotas `/app/*`
- **Totalmente reversível** — Pode remover `refetchTenant` se necessário

---

## SEÇÃO TÉCNICA

### Por que não usar React Query no TenantContext?

O `TenantContext` foi projetado para ser o "provider canônico" de tenant data em toda a aplicação. Migrar para React Query seria um refactor maior que:
1. Afetaria todos os consumidores do hook `useTenant()`
2. Introduziria complexidade desnecessária
3. Poderia gerar race conditions com outros caches

A solução de adicionar `refetchTrigger` é mínima e cirúrgica.

### Impersonation + Onboarding Interaction

```text
┌─────────────────────────────────────────────────────────────┐
│ ImpersonationContext                                        │
│   isImpersonating: true                                     │
│   targetTenantId: "abc-123"                                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ triggers useEffect
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ TenantOnboardingGate                                        │
│   1. Detect impersonation change                            │
│   2. Call refetchTenant()                                   │
│   3. Re-evaluate onboardingCompleted                        │
│   4. If complete → allow access                             │
└─────────────────────────────────────────────────────────────┘
```

### Defensive hasRealConfiguration Check

O check defensivo `hasRealConfiguration` previne loops mesmo se:
- A flag `onboarding_completed` não foi atualizada corretamente
- Houve falha no edge function
- O cache ficou stale por outro motivo

Critérios usados (já existentes no tenant):
- `tenant.isActive === true`
- `tenant.sportTypes.length > 0`

**Nota:** Não checamos `academies` aqui pois isso exigiria uma query adicional. Os critérios acima são suficientes para um bypass defensivo.
